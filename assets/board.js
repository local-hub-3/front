createApp({
  data() {
    return {
      theme: LocalHub.getInitialTheme(),
      searchKeyword: '',
      places: [],
      posts: [],
      loading: false,
      source: LocalHub.getQuery('from') || '',
      filters: {
        category: '전체',
        placeId: LocalHub.getQuery('placeId') || '',
        keyword: LocalHub.getQuery('q') || '',
      },
      toast: LocalHub.createToastState(),
    };
  },

  computed: {
    mapCategories() {
      return ['관광지', '음식점', '축제공연행사', '문화시설', '레포츠', '숙박', '쇼핑', '여행코스'];
    },

    filteredPosts() {
      const keyword = this.filters.keyword.toLocaleLowerCase('ko-KR');

      return this.posts.filter((post) => {
        const place = this.placeById(post.placeIds?.[0]);
        const categoryMatched =
          this.filters.category === '전체' ||
          place?.category === this.filters.category;
        const placeMatched =
          !this.filters.placeId ||
          post.placeIds?.includes(String(this.filters.placeId));
        const text = `${post.title} ${post.content || ''}`.toLocaleLowerCase('ko-KR');

        return categoryMatched && placeMatched && (!keyword || text.includes(keyword));
      });
    },
  },

  async mounted() {
    LocalHub.applyTheme(this.theme);
    await Promise.all([this.fetchPlaces(), this.fetchPosts()]);
  },

  methods: {
    relativeDate: LocalHub.relativeDate.bind(LocalHub),

    toggleTheme() {
      this.theme = LocalHub.toggleTheme(this.theme);
    },

    hideToast() {
      LocalHub.hideToast(this);
    },

    submitGlobalSearch() {
      this.filters.keyword = this.searchKeyword;
    },

    async fetchPlaces() {
      try {
        const data = await LocalHub.apiRequest('/places?size=5000');
        const items = Array.isArray(data) ? data : data?.items || [];
        this.places = items
          .map((place) => LocalHub.normalizePlace(place))
          ;
      } catch (error) {
        LocalHub.showToast(this, `장소 데이터를 불러오지 못했습니다. ${error.message}`);
      }
    },

    async fetchPosts() {
      this.loading = true;
      try {
        const data = await LocalHub.apiRequest('/posts?size=200&sort=latest');
        const items = Array.isArray(data) ? data : data?.items || [];
        this.posts = Array.from(
          new Map(
            items.map((post) => {
              const normalized = LocalHub.normalizePost(post);
              return [normalized.id, normalized];
            })
          ).values()
        );
      } catch (error) {
        LocalHub.showToast(this, `게시글을 불러오지 못했습니다. ${error.message}`);
      } finally {
        this.loading = false;
      }
    },

    placeById(id) {
      return this.places.find((place) => place.id === String(id));
    },

    placeName(id) {
      return this.placeById(id)?.name || '장소 미지정';
    },

    openPost(post) {
      const contextPlaceId =
        this.filters.placeId ||
        post.placeIds?.[0] ||
        '';

      const params = new URLSearchParams({
        id: String(post.id),
        from: 'board',
      });

      if (contextPlaceId) {
        params.set('placeId', String(contextPlaceId));
      }

      location.href = `/post/?${params.toString()}`;
    },

    startWrite() {
      const params = new URLSearchParams({
        from: 'board',
      });

      if (this.filters.placeId) {
        params.set('placeId', String(this.filters.placeId));
      }

      location.href = `/write/?${params.toString()}`;
    },

    goBack() {
      if (this.filters.placeId) {
        location.href =
          `/?placeId=${encodeURIComponent(this.filters.placeId)}`;
        return;
      }

      location.href = '/';
    },
  },
}).mount('#app');
