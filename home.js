createApp({
  data() {
    return {
      region: '구미',
      theme: LocalHub.getInitialTheme(),
      searchKeyword: '',
      selectedCategory: '전체',
      places: [],
      posts: [],
      map: null,
      markerLayer: null,
      resizeObserver: null,
      placePopup: null,
      brokenImages: {},
      loading: { places: false, posts: false },
      toast: LocalHub.createToastState(),
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
          (a, b) => (b.postCount || this.postsForPlace(b.id).length) -
                    (a.postCount || this.postsForPlace(a.id).length)
        );
      }

      if (this.selectedCategory !== '전체') {
        result = result.filter((place) => place.category === this.selectedCategory);
      }

      return result;
    },
  },

  async mounted() {
    LocalHub.applyTheme(this.theme);
    await Promise.all([this.fetchPlaces(), this.fetchPosts()]);
    this.$nextTick(() => this.initMap());
  },

  beforeUnmount() {
    this.resizeObserver?.disconnect();
    this.map?.remove();
    clearTimeout(this.toast.timer);
  },

  methods: {
    categoryIcon: LocalHub.categoryIcon.bind(LocalHub),
    relativeDate: LocalHub.relativeDate.bind(LocalHub),

    toggleTheme() {
      this.theme = LocalHub.toggleTheme(this.theme);
    },

    hideToast() {
      LocalHub.hideToast(this);
    },

    submitGlobalSearch() {
      if (this.searchKeyword.startsWith('게시글:')) {
        location.href = `board.html?q=${encodeURIComponent(this.searchKeyword.replace('게시글:', '').trim())}`;
        return;
      }

      this.renderMarkers();
      this.fitMarkers();
    },

    async fetchPlaces() {
      this.loading.places = true;
      try {
        const params = new URLSearchParams({ region: this.region, size: '500' });
        const data = await LocalHub.apiRequest(`/places?${params}`);
        const items = Array.isArray(data) ? data : data?.items || [];
        this.places = items
          .map((place) => LocalHub.normalizePlace(place))
          .filter((place) => LocalHub.isGumiPlace(place));
      } catch (error) {
        LocalHub.showToast(this, `장소 데이터를 불러오지 못했습니다. ${error.message}`);
      } finally {
        this.loading.places = false;
      }
    },

    async fetchPosts() {
      this.loading.posts = true;
      try {
        const data = await LocalHub.apiRequest('/posts?size=200&sort=latest');
        const items = Array.isArray(data) ? data : data?.items || [];
        this.posts = items.map((post) => LocalHub.normalizePost(post));
      } catch (error) {
        LocalHub.showToast(this, `게시글을 불러오지 못했습니다. ${error.message}`);
      } finally {
        this.loading.posts = false;
      }
    },

    initMap() {
      if (!window.L || this.map) return;

      const saved = JSON.parse(sessionStorage.getItem('localhub-map-view') || 'null');
      const center = saved?.center || [36.1195, 128.3446];
      const zoom = Number(saved?.zoom) || 12;

      this.map = L.map('map', {
        center,
        zoom,
        preferCanvas: true,
        zoomAnimation: true,
        markerZoomAnimation: true,
      });

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(this.map);

      this.markerLayer = L.layerGroup().addTo(this.map);
      this.renderMarkers();

      this.map.on('moveend zoomend', () => {
        const currentCenter = this.map.getCenter();
        sessionStorage.setItem('localhub-map-view', JSON.stringify({
          center: [currentCenter.lat, currentCenter.lng],
          zoom: this.map.getZoom(),
        }));
      });

      const mapElement = document.getElementById('map');
      this.resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => this.map?.invalidateSize({ pan: false }));
      });
      this.resizeObserver.observe(mapElement);

      this.map.whenReady(() => {
        requestAnimationFrame(() => {
          this.map.invalidateSize({ pan: false });
          const placeId = LocalHub.getQuery('placeId');
          if (placeId) {
            const place = this.places.find((item) => item.id === String(placeId));
            if (place) {
              this.map.setView([place.latitude, place.longitude], 15, { animate: false });
              this.placePopup = place;
            }
          }
        });
      });
    },

    createMarkerIcon(place) {
      return L.divIcon({
        className: 'marker-wrap',
        html: `<div class="marker marker-${place.contentTypeId || ''}"><span>${place.categoryIcon}</span></div>`,
        iconSize: [38, 46],
        iconAnchor: [19, 46],
      });
    },

    renderMarkers() {
      if (!this.markerLayer) return;
      this.markerLayer.clearLayers();

      this.filteredPlaces.forEach((place) => {
        const marker = L.marker([place.latitude, place.longitude], {
          icon: this.createMarkerIcon(place),
          riseOnHover: true,
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

        // 카테고리 변경 직후 지도 DOM 크기와 마커 좌표를 다시 계산합니다.
        requestAnimationFrame(() => {
          this.map?.invalidateSize({ pan: false });

          if (this.filteredPlaces.length === 1) {
            const place = this.filteredPlaces[0];
            this.map.setView(
              [place.latitude, place.longitude],
              15,
              { animate: false }
            );
          } else {
            this.fitMarkers();
          }
        });
      });
    },

    fitMarkers() {
      if (!this.map || !this.filteredPlaces.length) return;

      const validCoordinates = this.filteredPlaces
        .filter((place) => LocalHub.isGumiPlace(place))
        .map((place) => [place.latitude, place.longitude]);

      if (!validCoordinates.length) {
        this.map.setView([36.1195, 128.3446], 12, { animate: false });
        return;
      }

      const bounds = L.latLngBounds(validCoordinates);

      this.map.fitBounds(bounds, {
        padding: [35, 35],
        maxZoom: 14,
        animate: false,
      });
    },

    openPost(post) {
      location.href = `post.html?id=${encodeURIComponent(post.id)}`;
    },

    openPlacePosts(place) {
      location.href =
        `board.html?placeId=${encodeURIComponent(place.id)}&from=map`;
    },

    postsForPlace(id) {
      return this.posts.filter((post) => post.placeIds?.includes(String(id)));
    },

    placeRating(place) {
      return Number(place.averageRating || 0).toFixed(1);
    },

    placeReviews(place) {
      return place.reviewCount || 0;
    },

    markBroken(id) {
      this.brokenImages = { ...this.brokenImages, [id]: true };
    },
  },

  watch: {
    searchKeyword() {
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => this.renderMarkers(), 150);
    },
  },
}).mount('#app');
