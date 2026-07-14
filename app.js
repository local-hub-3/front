const { createApp } = Vue;

createApp({
  data() {
    return {
      region: '구미',
      view: 'home',
      map: null,
      markerLayer: null,
      places: [],
      posts: [],
      selectedCategory: '전체',
      searchKeyword: '',
      placePopup: null,
      brokenImages: {},
      chatOpen: false,
      chatInput: '',
      chatMessages: [],
      chatSessionId: this.createId(),
      editingPostId: null,
      currentPost: null,
      boardFilters: { category: '전체', placeId: '', keyword: '' },
      passwordModal: { open: false, action: '', value: '', error: '', show: false },
      postForm: { title: '', content: '', placeId: '', author: '', password: '' },
      commentForm: { author: '', content: '' },
      loading: { places: false, posts: false, detail: false, submit: false, chat: false },
      apiError: '',
      apiBaseUrl: (window.APP_CONFIG?.API_BASE_URL || 'http://localhost:8080/api').replace(/\/$/, ''),
      requestTimeoutMs: window.APP_CONFIG?.REQUEST_TIMEOUT_MS || 10000,
    };
  },

  computed: {
    mapCategories() {
      return ['관광지', '음식점', '축제공연행사', '문화시설', '레포츠', '숙박', '쇼핑', '여행코스'];
    },

    filteredPlaces() {
      const keyword = this.searchKeyword.toLocaleLowerCase('ko-KR');
      let result = this.places.filter((place) => {
        const text = `${place.name} ${place.address} ${place.category}`.toLocaleLowerCase('ko-KR');
        return !keyword || text.includes(keyword);
      });

      if (this.selectedCategory === '게시글 많은 곳') {
        return result.sort((a, b) => (b.postCount || this.postsForPlace(b.id).length) - (a.postCount || this.postsForPlace(a.id).length));
      }

      if (this.selectedCategory !== '전체') {
        result = result.filter((place) => place.category === this.selectedCategory);
      }

      return result;
    },

    filteredPosts() {
      const keyword = this.boardFilters.keyword.toLocaleLowerCase('ko-KR');
      return this.posts.filter((post) => {
        const place = this.placeById(post.placeIds?.[0]);
        const matchesCategory = this.boardFilters.category === '전체' || place?.category === this.boardFilters.category;
        const matchesPlace = !this.boardFilters.placeId || post.placeIds?.includes(this.boardFilters.placeId);
        const text = `${post.title} ${post.content || ''}`.toLocaleLowerCase('ko-KR');
        return matchesCategory && matchesPlace && (!keyword || text.includes(keyword));
      });
    },
  },

  async mounted() {
    await Promise.all([this.fetchPlaces(), this.fetchPosts()]);
    this.$nextTick(() => this.initMap());
  },

  methods: {
    createId() {
      return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    },

    async apiRequest(path, options = {}) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

      try {
        const response = await fetch(`${this.apiBaseUrl}${path}`, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
          },
          signal: controller.signal,
        });

        const contentType = response.headers.get('content-type') || '';
        const body = contentType.includes('application/json') ? await response.json() : null;

        if (!response.ok) {
          const error = new Error(body?.message || `서버 요청에 실패했습니다. (${response.status})`);
          error.status = response.status;
          error.code = body?.code;
          throw error;
        }

        return body;
      } catch (error) {
        if (error.name === 'AbortError') {
          throw new Error('서버 응답 시간이 초과되었습니다.');
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    },

    normalizePlace(place) {
      return {
        ...place,
        id: String(place.id ?? place.contentid ?? ''),
        name: place.name ?? place.title ?? '이름 없는 장소',
        category: place.category ?? place.contentType ?? '기타',
        address: place.address ?? [place.addr1, place.addr2].filter(Boolean).join(' ') ?? '',
        telephone: place.telephone ?? place.tel ?? '',
        latitude: Number(place.latitude ?? place.mapy),
        longitude: Number(place.longitude ?? place.mapx),
        image: place.image ?? place.firstimage ?? '',
        thumbnail: place.thumbnail ?? place.firstimage2 ?? place.firstimage ?? '',
        categoryIcon: place.categoryIcon || this.categoryIcon(place.category ?? place.contentType),
      };
    },

    normalizePost(post) {
      return {
        ...post,
        id: post.id,
        placeIds: (post.placeIds || []).map(String),
        comments: post.comments || [],
        commentCount: post.commentCount ?? post.comments?.length ?? 0,
        views: post.views ?? 0,
      };
    },

    async fetchPlaces() {
      this.loading.places = true;
      this.apiError = '';
      try {
        const params = new URLSearchParams({ region: this.region, size: '500' });
        const data = await this.apiRequest(`/places?${params}`);
        const items = Array.isArray(data) ? data : data?.items || [];
        this.places = items.map(this.normalizePlace).filter((place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude));
      } catch (error) {
        this.apiError = `장소 데이터를 불러오지 못했습니다: ${error.message}`;
        console.error(error);
      } finally {
        this.loading.places = false;
      }
    },

    async fetchPosts() {
      this.loading.posts = true;
      this.apiError = '';
      try {
        const data = await this.apiRequest('/posts?size=200&sort=latest');
        const items = Array.isArray(data) ? data : data?.items || [];
        this.posts = items.map(this.normalizePost);
      } catch (error) {
        this.apiError = `게시글을 불러오지 못했습니다: ${error.message}`;
        console.error(error);
      } finally {
        this.loading.posts = false;
      }
    },

    initMap() {
      if (!window.L || this.map) return;
      this.map = L.map('map', { center: [36.1195, 128.3446], zoom: 12, preferCanvas: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(this.map);
      this.markerLayer = L.layerGroup().addTo(this.map);
      this.renderMarkers();
      setTimeout(() => this.map.invalidateSize(), 100);
    },

    renderMarkers() {
      if (!this.markerLayer) return;
      this.markerLayer.clearLayers();
      this.filteredPlaces.forEach((place) => {
        const marker = L.marker([place.latitude, place.longitude], {
          icon: L.divIcon({
            className: 'marker-wrap',
            html: `<div class="marker marker-${place.contentTypeId || ''}">${place.categoryIcon}</div>`,
            iconSize: [36, 44],
            iconAnchor: [18, 44],
          }),
        });
        marker.on('click', () => { this.placePopup = place; });
        marker.bindTooltip(place.name, { direction: 'top', offset: [0, -35] });
        marker.addTo(this.markerLayer);
      });
    },

    selectCategory(category) {
      this.selectedCategory = category;
      this.$nextTick(() => { this.renderMarkers(); this.fitMarkers(); });
    },

    applySearch() {
      this.view = 'home';
      this.$nextTick(() => { this.renderMarkers(); this.fitMarkers(); });
    },

    fitMarkers() {
      if (!this.map || !this.filteredPlaces.length) return;
      const bounds = L.latLngBounds(this.filteredPlaces.map((place) => [place.latitude, place.longitude]));
      this.map.fitBounds(bounds, { padding: [35, 35], maxZoom: 14 });
    },

    goHome() {
      this.view = 'home';
      this.$nextTick(() => { this.map?.invalidateSize(); this.renderMarkers(); });
    },

    async openPost(post) {
      this.loading.detail = true;
      this.apiError = '';
      try {
        const detail = await this.apiRequest(`/posts/${encodeURIComponent(post.id)}`);
        this.currentPost = this.normalizePost(detail);
        const index = this.posts.findIndex((item) => String(item.id) === String(detail.id));
        if (index >= 0) this.posts.splice(index, 1, this.currentPost);
        this.view = 'detail';
      } catch (error) {
        this.apiError = `게시글 상세를 불러오지 못했습니다: ${error.message}`;
      } finally {
        this.loading.detail = false;
      }
    },

    openPlacePosts(place) {
      this.placePopup = null;
      this.boardFilters.placeId = place.id;
      this.view = 'list';
    },

    postsForPlace(id) {
      return this.posts.filter((post) => post.placeIds?.includes(String(id)));
    },

    placeById(id) {
      return this.places.find((place) => place.id === String(id));
    },

    placeName(id) {
      return this.placeById(id)?.name || '장소 미지정';
    },

    focusPlaceById(id) {
      const place = this.placeById(id);
      if (!place) return;
      this.placePopup = place;
      this.view = 'home';
      this.$nextTick(() => {
        this.map?.invalidateSize();
        this.map?.flyTo([place.latitude, place.longitude], 15);
      });
    },

    startWrite() {
      this.editingPostId = null;
      this.postForm = { title: '', content: '', placeId: '', author: '', password: '' };
      this.view = 'write';
    },

    async submitPost() {
      this.loading.submit = true;
      this.apiError = '';
      const payload = {
        title: this.postForm.title,
        content: this.postForm.content,
        author: this.postForm.author,
        password: this.postForm.password,
        placeIds: [String(this.postForm.placeId)],
      };

      try {
        const isEdit = this.editingPostId !== null;
        const path = isEdit ? `/posts/${encodeURIComponent(this.editingPostId)}` : '/posts';
        const result = await this.apiRequest(path, {
          method: isEdit ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        });
        this.currentPost = this.normalizePost(result);
        await this.fetchPosts();
        this.view = 'detail';
      } catch (error) {
        this.apiError = `게시글 저장에 실패했습니다: ${error.message}`;
      } finally {
        this.loading.submit = false;
      }
    },

    requestPassword(action) {
      this.passwordModal = { open: true, action, value: '', error: '', show: false };
    },

    async confirmPassword() {
      if (!this.currentPost) return;
      this.passwordModal.error = '';
      const password = this.passwordModal.value;

      if (this.passwordModal.action === 'edit') {
        this.passwordModal.open = false;
        this.editingPostId = this.currentPost.id;
        this.postForm = {
          title: this.currentPost.title,
          content: this.currentPost.content,
          placeId: this.currentPost.placeIds?.[0] || '',
          author: this.currentPost.author,
          password,
        };
        this.view = 'write';
        return;
      }

      this.loading.submit = true;
      try {
        await this.apiRequest(`/posts/${encodeURIComponent(this.currentPost.id)}`, {
          method: 'DELETE',
          body: JSON.stringify({ password }),
        });
        this.passwordModal.open = false;
        this.currentPost = null;
        await this.fetchPosts();
        this.view = 'list';
      } catch (error) {
        this.passwordModal.error = error.message;
      } finally {
        this.loading.submit = false;
      }
    },

    async submitComment() {
      if (!this.currentPost || !this.commentForm.author || !this.commentForm.content) return;
      this.loading.submit = true;
      try {
        const comment = await this.apiRequest(`/posts/${encodeURIComponent(this.currentPost.id)}/comments`, {
          method: 'POST',
          body: JSON.stringify(this.commentForm),
        });
        this.currentPost.comments = [...(this.currentPost.comments || []), comment];
        this.currentPost.commentCount = this.currentPost.comments.length;
        this.commentForm = { author: '', content: '' };
      } catch (error) {
        this.apiError = `댓글 등록에 실패했습니다: ${error.message}`;
      } finally {
        this.loading.submit = false;
      }
    },

    togglePasswordVisibility(event) {
      const input = event.target.closest('.password-modal')?.querySelector('input.password-input');
      if (input) input.type = this.passwordModal.show ? 'text' : 'password';
    },

    markBroken(id) {
      this.brokenImages = { ...this.brokenImages, [id]: true };
    },

    placeReviews(place) {
      return place.reviewCount || 0;
    },

    placeRating(place) {
      return Number(place.averageRating || 0).toFixed(1);
    },

    categoryIcon(category) {
      return ({ 전체: '🗺️', 관광지: '📍', 음식점: '🍽️', 축제공연행사: '🎉', 문화시설: '🎨', 레포츠: '🏃', 숙박: '🏨', 쇼핑: '🛍️', 여행코스: '🧭' })[category] || '📌';
    },

    formatDate(date) {
      return new Date(date).toLocaleString('ko-KR');
    },

    relativeDate(date) {
      const diff = Date.now() - new Date(date).getTime();
      if (diff < 3600000) return `${Math.max(1, Math.floor(diff / 60000))}분 전`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
      return `${Math.floor(diff / 86400000)}일 전`;
    },

    async sendChat() {
      if (!this.chatInput || this.loading.chat) return;
      const message = this.chatInput;
      this.chatMessages.push({ role: 'user', text: message });
      this.chatInput = '';
      this.loading.chat = true;

      try {
        const result = await this.apiRequest('/chat', {
          method: 'POST',
          body: JSON.stringify({ message, sessionId: this.chatSessionId, region: this.region }),
        });
        this.chatMessages.push({ role: 'bot', text: result.answer || '답변을 받지 못했습니다.', placeIds: result.recommendedPlaceIds || [] });
      } catch (error) {
        this.chatMessages.push({ role: 'bot', text: `챗봇 연결에 실패했습니다: ${error.message}` });
      } finally {
        this.loading.chat = false;
      }
    },
  },

  watch: {
    searchKeyword() {
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => this.renderMarkers(), 150);
    },
    view(value) {
      if (value === 'home') this.$nextTick(() => setTimeout(() => this.map?.invalidateSize(), 50));
    },
  },
}).mount('#app');
