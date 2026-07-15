import { createApp } from 'vue';

createApp({
  data() {
    const savedTheme = localStorage.getItem('localhub-theme');
    const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;

    return {
      region: '구미',
      view: 'home',
      theme: savedTheme || (systemDark ? 'dark' : 'light'),
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
      chatSessionId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      editingPostId: null,
      currentPost: null,
      boardFilters: { category: '전체', placeId: '', keyword: '' },
      passwordModal: { open: false, action: '', value: '', error: '', show: false },
      postForm: { title: '', content: '', placeId: '', author: '', password: '' },
      commentForm: { author: '', content: '', password: '' },
      commentModal: {
        open: false,
        action: '',
        comment: null,
        content: '',
        password: '',
        error: '',
      },
      loading: { places: false, posts: false, detail: false, submit: false, chat: false },
      toast: { visible: false, message: '', type: 'error' },
      toastTimer: null,
      apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api').replace(/\/$/, ''),
      requestTimeoutMs: Number(import.meta.env.VITE_REQUEST_TIMEOUT_MS) || 10000,
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
        return [...result].sort(
          (a, b) =>
            (b.postCount || this.postsForPlace(b.id).length) -
            (a.postCount || this.postsForPlace(a.id).length)
        );
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
        const matchesCategory =
          this.boardFilters.category === '전체' ||
          place?.category === this.boardFilters.category;
        const matchesPlace =
          !this.boardFilters.placeId ||
          post.placeIds?.includes(String(this.boardFilters.placeId));
        const text = `${post.title} ${post.content || ''}`.toLocaleLowerCase('ko-KR');

        return matchesCategory && matchesPlace && (!keyword || text.includes(keyword));
      });
    },
  },

  async mounted() {
    document.documentElement.dataset.theme = this.theme;
    await Promise.all([this.fetchPlaces(), this.fetchPosts()]);
    this.$nextTick(() => this.initMap());
  },

  beforeUnmount() {
    clearTimeout(this.toastTimer);
  },

  methods: {
    toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = this.theme;
      localStorage.setItem('localhub-theme', this.theme);

      this.$nextTick(() => {
        this.map?.invalidateSize();
      });
    },

    showToast(message, type = 'error') {
      clearTimeout(this.toastTimer);
      this.toast = { visible: true, message, type };

      this.toastTimer = setTimeout(() => {
        this.hideToast();
      }, 3000);
    },

    hideToast() {
      clearTimeout(this.toastTimer);
      this.toast.visible = false;
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
        let body = null;

        if (contentType.includes('application/json')) {
          body = await response.json();
        }

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

        if (error instanceof TypeError) {
          throw new Error('서버에 연결할 수 없습니다. 서버 주소와 실행 상태를 확인하세요.');
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
        comments: (post.comments || []).map((comment) => ({
          ...comment,
          id: String(comment.id),
        })),
        commentCount: post.commentCount ?? post.comments?.length ?? 0,
        views: post.views ?? 0,
      };
    },

    async fetchPlaces() {
      this.loading.places = true;

      try {
        const params = new URLSearchParams({ region: this.region, size: '500' });
        const data = await this.apiRequest(`/places?${params}`);
        const items = Array.isArray(data) ? data : data?.items || [];

        this.places = items
          .map(this.normalizePlace)
          .filter(
            (place) =>
              Number.isFinite(place.latitude) &&
              Number.isFinite(place.longitude)
          );
      } catch (error) {
        console.error(error);
        this.showToast(`장소 데이터를 불러오지 못했습니다. ${error.message}`);
      } finally {
        this.loading.places = false;
      }
    },

    async fetchPosts(showSuccess = false) {
      this.loading.posts = true;

      try {
        const data = await this.apiRequest('/posts?size=200&sort=latest');
        const items = Array.isArray(data) ? data : data?.items || [];
        this.posts = items.map(this.normalizePost);

        if (showSuccess) {
          this.showToast('게시글 정보가 갱신되었습니다.', 'success');
        }
      } catch (error) {
        console.error(error);
        this.showToast(`게시글을 불러오지 못했습니다. ${error.message}`);
      } finally {
        this.loading.posts = false;
      }
    },

    initMap() {
      if (!window.L) {
        this.showToast('지도 라이브러리를 불러오지 못했습니다.');
        return;
      }

      if (this.map) return;

      const mapElement = document.getElementById('map');

      if (!mapElement) {
        this.showToast('지도 영역을 찾지 못했습니다.');
        return;
      }

      try {
        this.map = L.map('map', {
          center: [36.1195, 128.3446],
          zoom: 12,
          preferCanvas: true,
        });

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap',
        }).addTo(this.map);

        this.markerLayer = L.layerGroup().addTo(this.map);
        this.renderMarkers();
        setTimeout(() => this.map.invalidateSize(), 100);
      } catch (error) {
        console.error(error);
        this.showToast('지도를 초기화하지 못했습니다.');
      }
    },

    renderMarkers() {
      if (!this.markerLayer) return;

      this.markerLayer.clearLayers();

      this.filteredPlaces.forEach((place) => {
        const marker = L.marker([place.latitude, place.longitude], {
          icon: L.divIcon({
            className: 'marker-wrap',
            html: `<div class="marker marker-${place.contentTypeId || ''}"><span>${place.categoryIcon}</span></div>`,
            iconSize: [38, 46],
            iconAnchor: [19, 46],
          }),
        });

        marker.on('click', () => {
          this.placePopup = place;
        });

        marker.bindTooltip(place.name, {
          direction: 'top',
          offset: [0, -37],
        });

        marker.addTo(this.markerLayer);
      });
    },

    selectCategory(category) {
      this.selectedCategory = category;
      this.$nextTick(() => {
        this.renderMarkers();
        this.fitMarkers();
      });
    },

    applySearch() {
      this.view = 'home';
      this.$nextTick(() => {
        this.map?.invalidateSize();
        this.renderMarkers();

        if (this.filteredPlaces.length) {
          this.fitMarkers();
        } else {
          this.showToast('검색 조건에 맞는 장소가 없습니다.');
        }
      });
    },

    fitMarkers() {
      if (!this.map || !this.filteredPlaces.length) return;

      const bounds = L.latLngBounds(
        this.filteredPlaces.map((place) => [place.latitude, place.longitude])
      );

      this.map.fitBounds(bounds, { padding: [35, 35], maxZoom: 14 });
    },

    goHome() {
      this.view = 'home';
      this.$nextTick(() => {
        this.map?.invalidateSize();
        this.renderMarkers();
      });
    },

    async openPost(post) {
      this.loading.detail = true;

      try {
        const detail = await this.apiRequest(`/posts/${encodeURIComponent(post.id)}`);
        this.currentPost = this.normalizePost(detail);

        const index = this.posts.findIndex(
          (item) => String(item.id) === String(detail.id)
        );

        if (index >= 0) {
          this.posts.splice(index, 1, this.currentPost);
        }

        this.view = 'detail';
      } catch (error) {
        this.showToast(`게시글 상세를 불러오지 못했습니다. ${error.message}`);
      } finally {
        this.loading.detail = false;
      }
    },

    openPlacePosts(place) {
      this.closePlacePopup();
      this.boardFilters.placeId = String(place.id);
      this.view = 'list';
    },

    closePlacePopup() {
      this.placePopup = null;
    },

    postsForPlace(id) {
      return this.posts.filter((post) =>
        post.placeIds?.includes(String(id))
      );
    },

    placeById(id) {
      return this.places.find((place) => place.id === String(id));
    },

    placeName(id) {
      return this.placeById(id)?.name || '장소 미지정';
    },

    focusPlaceById(id) {
      const place = this.placeById(id);

      if (!place) {
        this.showToast('연결된 장소 정보를 찾을 수 없습니다.');
        return;
      }

      this.placePopup = place;
      this.view = 'home';

      this.$nextTick(() => {
        this.map?.invalidateSize();
        this.map?.flyTo([place.latitude, place.longitude], 15);
      });
    },

    startWrite() {
      this.editingPostId = null;
      this.postForm = {
        title: '',
        content: '',
        placeId: '',
        author: '',
        password: '',
      };
      this.view = 'write';
    },

    async submitPost() {
      if (!this.postForm.placeId) {
        this.showToast('게시글과 연결할 장소를 선택해 주세요.');
        return;
      }

      this.loading.submit = true;

      const payload = {
        title: this.postForm.title,
        content: this.postForm.content,
        author: this.postForm.author,
        password: this.postForm.password,
        placeIds: [String(this.postForm.placeId)],
      };

      try {
        const isEdit = this.editingPostId !== null;
        const path = isEdit
          ? `/posts/${encodeURIComponent(this.editingPostId)}`
          : '/posts';

        const result = await this.apiRequest(path, {
          method: isEdit ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        });

        this.currentPost = this.normalizePost(result);
        await this.fetchPosts();
        this.view = 'detail';
        this.showToast(
          isEdit ? '게시글이 수정되었습니다.' : '게시글이 등록되었습니다.',
          'success'
        );
      } catch (error) {
        this.showToast(`게시글 저장에 실패했습니다. ${error.message}`);
      } finally {
        this.loading.submit = false;
      }
    },

    requestPassword(action) {
      this.passwordModal = {
        open: true,
        action,
        value: '',
        error: '',
        show: false,
      };
    },

    closePasswordModal() {
      this.passwordModal = {
        open: false,
        action: '',
        value: '',
        error: '',
        show: false,
      };
    },

    async confirmPassword() {
      if (!this.currentPost) {
        this.showToast('현재 게시글 정보를 찾을 수 없습니다.');
        return;
      }

      if (!this.passwordModal.value) {
        this.passwordModal.error = '비밀번호를 입력해 주세요.';
        return;
      }

      this.passwordModal.error = '';
      const password = this.passwordModal.value;

      if (this.passwordModal.action === 'edit') {
        this.closePasswordModal();
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
        await this.apiRequest(
          `/posts/${encodeURIComponent(this.currentPost.id)}`,
          {
            method: 'DELETE',
            body: JSON.stringify({ password }),
          }
        );

        this.closePasswordModal();
        this.currentPost = null;
        await this.fetchPosts();
        this.view = 'list';
        this.showToast('게시글이 삭제되었습니다.', 'success');
      } catch (error) {
        this.passwordModal.error = error.message;
        this.showToast(`게시글 삭제에 실패했습니다. ${error.message}`);
      } finally {
        this.loading.submit = false;
      }
    },

    async submitComment() {
      if (
        !this.currentPost ||
        !this.commentForm.author ||
        !this.commentForm.content ||
        !this.commentForm.password
      ) {
        this.showToast('작성자, 댓글 내용, 비밀번호를 모두 입력해 주세요.');
        return;
      }

      this.loading.submit = true;

      try {
        const comment = await this.apiRequest(
          `/posts/${encodeURIComponent(this.currentPost.id)}/comments`,
          {
            method: 'POST',
            body: JSON.stringify(this.commentForm),
          }
        );

        this.currentPost.comments = [
          ...(this.currentPost.comments || []),
          {
            ...comment,
            id: String(comment.id),
          },
        ];
        this.currentPost.commentCount = this.currentPost.comments.length;
        this.commentForm = { author: '', content: '', password: '' };
        this.showToast('댓글이 등록되었습니다.', 'success');
      } catch (error) {
        this.showToast(`댓글 등록에 실패했습니다. ${error.message}`);
      } finally {
        this.loading.submit = false;
      }
    },

    requestCommentAction(action, comment) {
      this.commentModal = {
        open: true,
        action,
        comment,
        content: comment.content || '',
        password: '',
        error: '',
      };
    },

    closeCommentModal() {
      this.commentModal = {
        open: false,
        action: '',
        comment: null,
        content: '',
        password: '',
        error: '',
      };
    },

    async confirmCommentAction() {
      if (!this.currentPost || !this.commentModal.comment) {
        this.showToast('댓글 정보를 찾을 수 없습니다.');
        return;
      }

      if (!this.commentModal.password) {
        this.commentModal.error = '비밀번호를 입력해 주세요.';
        return;
      }

      if (
        this.commentModal.action === 'edit' &&
        !this.commentModal.content
      ) {
        this.commentModal.error = '수정할 댓글 내용을 입력해 주세요.';
        return;
      }

      this.commentModal.error = '';
      this.loading.submit = true;

      const postId = encodeURIComponent(this.currentPost.id);
      const commentId = encodeURIComponent(this.commentModal.comment.id);

      try {
        if (this.commentModal.action === 'edit') {
          const updated = await this.apiRequest(
            `/posts/${postId}/comments/${commentId}`,
            {
              method: 'PUT',
              body: JSON.stringify({
                content: this.commentModal.content,
                password: this.commentModal.password,
              }),
            }
          );

          const index = this.currentPost.comments.findIndex(
            (comment) =>
              String(comment.id) ===
              String(this.commentModal.comment.id)
          );

          if (index >= 0) {
            this.currentPost.comments.splice(index, 1, {
              ...this.currentPost.comments[index],
              ...updated,
              id: String(updated.id ?? this.commentModal.comment.id),
            });
          }

          this.closeCommentModal();
          this.showToast('댓글이 수정되었습니다.', 'success');
        } else {
          await this.apiRequest(
            `/posts/${postId}/comments/${commentId}`,
            {
              method: 'DELETE',
              body: JSON.stringify({
                password: this.commentModal.password,
              }),
            }
          );

          this.currentPost.comments = this.currentPost.comments.filter(
            (comment) =>
              String(comment.id) !==
              String(this.commentModal.comment.id)
          );
          this.currentPost.commentCount =
            this.currentPost.comments.length;

          this.closeCommentModal();
          this.showToast('댓글이 삭제되었습니다.', 'success');
        }
      } catch (error) {
        this.commentModal.error = error.message;
        this.showToast(
          `댓글 ${
            this.commentModal.action === 'edit' ? '수정' : '삭제'
          }에 실패했습니다. ${error.message}`
        );
      } finally {
        this.loading.submit = false;
      }
    },

    togglePasswordVisibility(event) {
      const input = event.target
        .closest('.password-modal')
        ?.querySelector('input.password-input');

      if (input) {
        input.type = this.passwordModal.show ? 'text' : 'password';
      }
    },

    markBroken(id) {
      this.brokenImages = {
        ...this.brokenImages,
        [id]: true,
      };
    },

    placeReviews(place) {
      return place.reviewCount || 0;
    },

    placeRating(place) {
      return Number(place.averageRating || 0).toFixed(1);
    },

    categoryIcon(category) {
      return (
        {
          전체: '🗺️',
          관광지: '📍',
          음식점: '🍽️',
          축제공연행사: '🎉',
          문화시설: '🎨',
          레포츠: '🏃',
          숙박: '🏨',
          쇼핑: '🛍️',
          여행코스: '🧭',
        }[category] || '📌'
      );
    },

    formatDate(date) {
      if (!date) return '날짜 정보 없음';

      const parsed = new Date(date);
      return Number.isNaN(parsed.getTime())
        ? '날짜 정보 없음'
        : parsed.toLocaleString('ko-KR');
    },

    relativeDate(date) {
      if (!date) return '날짜 없음';

      const time = new Date(date).getTime();
      if (Number.isNaN(time)) return '날짜 없음';

      const diff = Date.now() - time;

      if (diff < 3600000) {
        return `${Math.max(1, Math.floor(diff / 60000))}분 전`;
      }

      if (diff < 86400000) {
        return `${Math.floor(diff / 3600000)}시간 전`;
      }

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
          body: JSON.stringify({
            message,
            sessionId: this.chatSessionId,
            region: this.region,
          }),
        });

        this.chatMessages.push({
          role: 'bot',
          text: result?.answer || '답변을 받지 못했습니다.',
          placeIds: result?.recommendedPlaceIds || [],
        });
      } catch (error) {
        this.showToast(`챗봇 연결에 실패했습니다. ${error.message}`);
        this.chatMessages.push({
          role: 'bot',
          text: '현재 챗봇 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
        });
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
      if (value === 'home') {
        this.$nextTick(() =>
          setTimeout(() => this.map?.invalidateSize(), 50)
        );
      }
    },
  },
}).mount('#app');
