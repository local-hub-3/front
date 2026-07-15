createApp({
  data() {
    return {
      theme: LocalHub.getInitialTheme(),
      searchKeyword: '',
      postId: LocalHub.getQuery('id'),
      contextPlaceId: LocalHub.getQuery('placeId') || '',
      source: LocalHub.getQuery('from') || '',
      places: [],
      loading: false,
      form: {
        title: '',
        content: '',
        placeId: LocalHub.getQuery('placeId') || '',
        author: '',
        password: '',
      },
      toast: LocalHub.createToastState(),
    };
  },

  computed: {
    editing() {
      return Boolean(this.postId);
    },
  },

  async mounted() {
    LocalHub.applyTheme(this.theme);
    await this.fetchPlaces();
    if (this.editing) {
      await this.fetchPost();
    }
  },

  methods: {
    toggleTheme() {
      this.theme = LocalHub.toggleTheme(this.theme);
    },

    hideToast() {
      LocalHub.hideToast(this);
    },

    submitGlobalSearch() {
      location.href = `/board/?q=${encodeURIComponent(this.searchKeyword)}`;
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

    async fetchPost() {
      try {
        const post = LocalHub.normalizePost(
          await LocalHub.apiRequest(`/posts/${encodeURIComponent(this.postId)}`)
        );
        this.form = {
          title: post.title,
          content: post.content,
          placeId:
            post.placeIds?.[0] ||
            this.contextPlaceId ||
            '',
          author: post.author,
          password:
            sessionStorage.getItem('localhub-edit-password') || '',
        };

        if (!this.contextPlaceId && this.form.placeId) {
          this.contextPlaceId = String(this.form.placeId);
        }
        sessionStorage.removeItem('localhub-edit-password');
      } catch (error) {
        LocalHub.showToast(this, `게시글을 불러오지 못했습니다. ${error.message}`);
      }
    },

    async submitPost() {
      this.loading = true;
      try {
        const selectedPlaceId = this.form.placeId
          ? String(this.form.placeId)
          : null;

        const payload = {
          title: this.form.title,
          content: this.form.content,
          author: this.form.author,
          password: this.form.password,

          // 서버 DTO가 단일 장소 또는 배열 방식 중 어느 쪽이든
          // 장소 태그를 받을 수 있도록 둘 다 전달합니다.
          ...(selectedPlaceId && {
            placeId: selectedPlaceId,
            placeIds: [selectedPlaceId],
          }),
        };

        const result = await LocalHub.apiRequest(
          this.editing
            ? `/posts/${encodeURIComponent(this.postId)}`
            : '/posts',
          {
            method: this.editing ? 'PUT' : 'POST',
            body: JSON.stringify(payload),
          }
        );

        LocalHub.showToast(
          this,
          this.editing ? '게시글이 수정되었습니다.' : '게시글이 등록되었습니다.',
          'success'
        );

        const responsePost = result?.data ?? result;
        const createdPostId =
          responsePost?.id ??
          responsePost?.postId ??
          this.postId;

        const confirmedPlaceId =
          responsePost?.placeIds?.[0] ??
          responsePost?.placeId ??
          this.form.placeId ??
          this.contextPlaceId;

        setTimeout(() => {
          if (createdPostId) {
            const params = new URLSearchParams({
              id: String(createdPostId),
              from: 'write',
            });

            if (confirmedPlaceId) {
              params.set('placeId', String(confirmedPlaceId));
            }

            location.replace(`/post/?${params.toString()}`);
            return;
          }

          // 서버가 생성된 게시글 ID를 반환하지 않을 때도
          // 전체 게시판이 아닌 선택했던 장소 게시판으로 이동합니다.
          const params = new URLSearchParams();

          if (confirmedPlaceId) {
            params.set('placeId', String(confirmedPlaceId));
          }

          location.replace(
            params.toString()
              ? `/board/?${params.toString()}`
              : '/board/'
          );
        }, 450);
      } catch (error) {
        LocalHub.showToast(this, `게시글 저장에 실패했습니다. ${error.message}`);
      } finally {
        this.loading = false;
      }
    },

    goBack() {
      const placeId =
        this.form.placeId ||
        this.contextPlaceId ||
        '';

      if (this.editing) {
        const params = new URLSearchParams({
          id: String(this.postId),
          from: 'write',
        });

        if (placeId) {
          params.set('placeId', String(placeId));
        }

        location.href = `/post/?${params.toString()}`;
        return;
      }

      const params = new URLSearchParams();

      if (placeId) {
        params.set('placeId', String(placeId));
      }

      location.href =
        params.toString()
          ? `/board/?${params.toString()}`
          : '/board/';
    },
  },
}).mount('#app');
