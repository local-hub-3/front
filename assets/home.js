createApp({
  data() {
    return {
      region: '',
      theme: LocalHub.getInitialTheme(),
      searchKeyword: '',
      selectedCategory: '전체',
      places: [],
      posts: [],
      map: null,
      markerOverlays: [],
      resizeObserver: null,
      placePopup: null,
      brokenImages: {},
      chatOpen: false,
      chatInput: '',
      chatMessages: [],
      chatSessionId: LocalHub.createId(),
      loading: {
        places: false,
        posts: false,
        map: false,
        chat: false,
      },
      toast: LocalHub.createToastState(),
    };
  },

  computed: {
    mapCategories() {
      return [
        '관광지',
        '음식점',
        '축제공연행사',
        '문화시설',
        '레포츠',
        '숙박',
        '쇼핑',
      ];
    },

    recentLoopPosts() {
      return this.posts.slice(0, 8);
    },

    filteredPlaces() {
      const keyword = this.searchKeyword.toLocaleLowerCase('ko-KR');

      let result = this.places.filter((place) => {
        const text =
          `${place.name} ${place.address} ${place.category}`
            .toLocaleLowerCase('ko-KR');

        return !keyword || text.includes(keyword);
      });
      if (this.selectedCategory !== '전체') {
        result = result.filter(
          (place) => place.category === this.selectedCategory
        );
      }

      return result;
    },
  },

  async mounted() {
    LocalHub.applyTheme(this.theme);

    await Promise.all([
      this.fetchPlaces(),
      this.fetchPosts(),
    ]);

    this.$nextTick(() => this.initMap());
  },

  beforeUnmount() {
    this.resizeObserver?.disconnect();
    this.clearMarkers();
    clearTimeout(this.toast.timer);
    clearTimeout(this.searchTimer);
  },

  methods: {
    categoryIcon: LocalHub.categoryIcon.bind(LocalHub),
    relativeDate: LocalHub.relativeDate.bind(LocalHub),

    toggleTheme() {
      this.theme = LocalHub.toggleTheme(this.theme);

      this.$nextTick(() => {
        this.map?.relayout();
      });
    },

    hideToast() {
      LocalHub.hideToast(this);
    },

    submitGlobalSearch() {
      if (this.searchKeyword.startsWith('게시글:')) {
        location.href =
          `/board/?q=${encodeURIComponent(
            this.searchKeyword.replace('게시글:', '').trim()
          )}`;
        return;
      }

      this.renderMarkers();
      this.fitMarkers();
    },

    async fetchPlaces() {
      this.loading.places = true;

      try {
        const params = new URLSearchParams({
          size: '500',
        });

        const data = await LocalHub.apiRequest(
          `/places?${params}`
        );

        const items = Array.isArray(data)
          ? data
          : data?.items || [];

        this.places = items
          .map((place) => LocalHub.normalizePlace(place))
          ;
      } catch (error) {
        LocalHub.showToast(
          this,
          `장소 데이터를 불러오지 못했습니다. ${error.message}`
        );
      } finally {
        this.loading.places = false;
      }
    },

    async fetchPosts() {
      this.loading.posts = true;

      try {
        const data = await LocalHub.apiRequest(
          '/posts?size=200&sort=latest'
        );

        const items = Array.isArray(data)
          ? data
          : data?.items || [];

        this.posts = items.map((post) =>
          LocalHub.normalizePost(post)
        );
      } catch (error) {
        LocalHub.showToast(
          this,
          `게시글을 불러오지 못했습니다. ${error.message}`
        );
      } finally {
        this.loading.posts = false;
      }
    },

    async initMap() {
      if (this.map || this.loading.map) return;

      this.loading.map = true;

      try {
        const kakaoMaps = await window.loadKakaoMapSdk();

        if (
          !kakaoMaps ||
          typeof kakaoMaps.Map !== 'function' ||
          typeof kakaoMaps.LatLng !== 'function'
        ) {
          throw new Error(
            '카카오 지도 SDK 초기화가 완료되지 않았습니다.'
          );
        }

        const mapElement = document.getElementById('map');

        if (!mapElement) {
          throw new Error('지도 영역을 찾지 못했습니다.');
        }

        const saved = JSON.parse(
          sessionStorage.getItem('localhub-map-view') || 'null'
        );

        const center = saved?.center || [36.1195, 128.3446];
        const level = Number(saved?.level) || 7;

        this.map = new kakaoMaps.Map(mapElement, {
          center: new kakaoMaps.LatLng(
            Number(center[0]),
            Number(center[1])
          ),
          level,
        });

        const zoomControl = new kakaoMaps.ZoomControl();

        this.map.addControl(
          zoomControl,
          kakaoMaps.ControlPosition.RIGHT
        );

        kakaoMaps.event.addListener(
          this.map,
          'idle',
          () => {
            const currentCenter = this.map.getCenter();

            sessionStorage.setItem(
              'localhub-map-view',
              JSON.stringify({
                center: [
                  currentCenter.getLat(),
                  currentCenter.getLng(),
                ],
                level: this.map.getLevel(),
              })
            );
          }
        );

        this.resizeObserver = new ResizeObserver(() => {
          requestAnimationFrame(() => {
            if (!this.map) return;

            const centerBeforeResize = this.map.getCenter();
            this.map.relayout();
            this.map.setCenter(centerBeforeResize);
          });
        });

        this.resizeObserver.observe(mapElement);

        this.renderMarkers();

        requestAnimationFrame(() => {
          this.map.relayout();

          const placeId = LocalHub.getQuery('placeId');

          if (placeId) {
            const place = this.places.find(
              (item) => item.id === String(placeId)
            );

            if (place) {
              const position = new kakaoMaps.LatLng(
                place.latitude,
                place.longitude
              );

              this.map.setLevel(4);
              this.map.setCenter(position);
              this.placePopup = place;
            }
          }
        });
      } catch (error) {
        console.error(error);

        LocalHub.showToast(
          this,
          `카카오 지도를 초기화하지 못했습니다. ${error.message}`
        );
      } finally {
        this.loading.map = false;
      }
    },

    createMarkerElement(place) {
      const wrapper = document.createElement('button');
      wrapper.type = 'button';
      wrapper.className = 'kakao-place-marker';
      wrapper.setAttribute('aria-label', place.name);

      const pin = document.createElement('span');
      pin.className =
        `kakao-marker-pin marker-${place.contentTypeId || ''}`;

      const icon = document.createElement('span');
      icon.className = 'kakao-marker-icon';
      icon.textContent = place.categoryIcon;

      const tooltip = document.createElement('span');
      tooltip.className = 'kakao-marker-tooltip';
      tooltip.textContent = place.name;

      pin.appendChild(icon);
      wrapper.appendChild(pin);
      wrapper.appendChild(tooltip);

      wrapper.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.placePopup = place;
      });

      return wrapper;
    },

    clearMarkers() {
      this.markerOverlays.forEach((overlay) => {
        overlay.setMap(null);
      });

      this.markerOverlays = [];
    },

    renderMarkers() {
      if (!this.map || !window.kakao?.maps) return;

      this.clearMarkers();

      this.filteredPlaces.forEach((place) => {
        if (!LocalHub.isGumiPlace(place)) return;

        const overlay = new kakao.maps.CustomOverlay({
          map: this.map,
          position: new kakao.maps.LatLng(
            place.latitude,
            place.longitude
          ),
          content: this.createMarkerElement(place),
          yAnchor: 1,
          xAnchor: 0.5,
          zIndex: 3,
        });

        this.markerOverlays.push(overlay);
      });
    },

    selectCategory(category) {
      this.selectedCategory = category;

      this.$nextTick(() => {
        if (!this.map) return;

        const center = this.map.getCenter();

        this.map.relayout();
        this.map.setCenter(center);
        this.renderMarkers();
        this.fitMarkers();
      });
    },

    fitMarkers() {
      if (
        !this.map ||
        !window.kakao?.maps ||
        !this.filteredPlaces.length
      ) {
        return;
      }

      const validPlaces = this.filteredPlaces.filter(
        (place) => LocalHub.isGumiPlace(place)
      );

      if (!validPlaces.length) {
        this.map.setLevel(7);
        this.map.setCenter(
          new kakao.maps.LatLng(36.1195, 128.3446)
        );
        return;
      }

      if (validPlaces.length === 1) {
        const place = validPlaces[0];

        this.map.setLevel(4);
        this.map.setCenter(
          new kakao.maps.LatLng(
            place.latitude,
            place.longitude
          )
        );
        return;
      }

      const bounds = new kakao.maps.LatLngBounds();

      validPlaces.forEach((place) => {
        bounds.extend(
          new kakao.maps.LatLng(
            place.latitude,
            place.longitude
          )
        );
      });

      this.map.setBounds(bounds, 60, 60, 60, 60);
    },

    clearPlaceContextFromUrl() {
      const url = new URL(window.location.href);

      url.searchParams.delete('placeId');
      url.searchParams.delete('from');

      const query = url.searchParams.toString();
      const cleanUrl =
        `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;

      window.history.replaceState(
        window.history.state,
        '',
        cleanUrl
      );
    },

    closePlacePopup() {
      this.placePopup = null;
      this.clearPlaceContextFromUrl();
    },

    goHome() {
      this.placePopup = null;
      this.clearPlaceContextFromUrl();

      // 홈 화면에서 로고를 누른 경우 불필요한 새로고침 없이
      // 지도 기본 상태로 복귀합니다.
      this.selectedCategory = '전체';
      this.searchKeyword = '';

      this.$nextTick(() => {
        this.renderMarkers();

        if (this.map && window.kakao?.maps) {
          this.map.setLevel(7);
          this.map.setCenter(
            new kakao.maps.LatLng(36.1195, 128.3446)
          );
        }
      });
    },

    openPost(post) {
      location.href =
        `/post/?id=${encodeURIComponent(post.id)}`;
    },

    openPlacePosts(place) {
      location.href =
        `/board/?placeId=${encodeURIComponent(place.id)}&from=map`;
    },

    postsForPlace(id) {
      return this.posts.filter((post) =>
        post.placeIds?.includes(String(id))
      );
    },

    placeRating(place) {
      return Number(place.averageRating || 0).toFixed(1);
    },

    placeReviews(place) {
      return place.reviewCount || 0;
    },

    placeName(id) {
      return this.places.find(
        (place) => place.id === String(id)
      )?.name || '추천 장소';
    },

    toggleChat() {
      this.chatOpen = !this.chatOpen;

      if (this.chatOpen) {
        this.scrollChatToBottom();
      }
    },

    scrollChatToBottom() {
      this.$nextTick(() => {
        const chatLog = this.$refs.chatLog;

        if (chatLog) {
          chatLog.scrollTop = chatLog.scrollHeight;
        }
      });
    },

    async sendChat() {
      const message = this.chatInput.trim();

      if (!message || this.loading.chat) return;

      this.chatMessages.push({
        role: 'user',
        text: message,
        placeIds: [],
      });

      this.chatInput = '';
      this.loading.chat = true;
      this.scrollChatToBottom();

      try {
        const result = await LocalHub.apiRequest('/chat', {
          method: 'POST',
          body: JSON.stringify({
            message,
            sessionId: this.chatSessionId,
            region: this.region,
          }),
        });

        const recommendedPlaceIds =
          result?.recommendedPlaceIds ??
          result?.placeIds ??
          [];

        this.chatMessages.push({
          role: 'bot',
          text:
            result?.answer ??
            result?.message ??
            '답변을 받지 못했습니다.',
          placeIds: Array.isArray(recommendedPlaceIds)
            ? recommendedPlaceIds.map(String)
            : [],
        });
      } catch (error) {
        console.error('챗봇 요청 실패:', error);

        this.chatMessages.push({
          role: 'bot',
          text:
            '현재 챗봇 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
          placeIds: [],
        });

        LocalHub.showToast(
          this,
          `챗봇 연결에 실패했습니다. ${error.message}`
        );
      } finally {
        this.loading.chat = false;
        this.scrollChatToBottom();
      }
    },

    openRecommendedPlace(placeId) {
      const place = this.places.find(
        (item) => item.id === String(placeId)
      );

      if (!place) {
        LocalHub.showToast(
          this,
          '추천 장소 정보를 지도에서 찾지 못했습니다.'
        );
        return;
      }

      this.chatOpen = false;
      this.selectedCategory = '전체';
      this.searchKeyword = '';

      this.$nextTick(() => {
        this.renderMarkers();

        if (this.map && window.kakao?.maps) {
          const position = new kakao.maps.LatLng(
            place.latitude,
            place.longitude
          );

          this.map.setLevel(4);
          this.map.setCenter(position);
          this.placePopup = place;
        }
      });
    },

    markBroken(id) {
      this.brokenImages = {
        ...this.brokenImages,
        [id]: true,
      };
    },
  },

  watch: {
    searchKeyword() {
      clearTimeout(this.searchTimer);

      this.searchTimer = setTimeout(() => {
        this.renderMarkers();
      }, 150);
    },
  },
}).mount('#app');
