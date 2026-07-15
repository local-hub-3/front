createApp({
  data() {
    return {
      theme: LocalHub.getInitialTheme(),
      searchKeyword: '',
      postId: LocalHub.getQuery('id'),
      contextPlaceId: LocalHub.getQuery('placeId') || '',
      source: LocalHub.getQuery('from') || '',
      post: null,
      places: [],
      loading: false,
      commentForm: { author: '', content: '', password: '' },
      actionModal: {
        open: false,
        target: '',
        action: '',
        item: null,
        content: '',
        password: '',
        error: '',
      },
      toast: LocalHub.createToastState(),
    };
  },

  async mounted() {
    LocalHub.applyTheme(this.theme);
    if (!this.postId) {
      location.replace('/board/');
      return;
    }
    await Promise.all([this.fetchPlaces(), this.fetchPost()]);
  },

  methods: {
    formatDate: LocalHub.formatDate.bind(LocalHub),

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
        const data = await LocalHub.apiRequest('/places?region=구미&size=500');
        const items = Array.isArray(data) ? data : data?.items || [];
        this.places = items
          .map((place) => LocalHub.normalizePlace(place))
          .filter((place) => LocalHub.isGumiPlace(place));
      } catch (error) {
        LocalHub.showToast(this, `장소 데이터를 불러오지 못했습니다. ${error.message}`);
      }
    },

    async fetchPost() {
      this.loading = true;
      try {
        const data = await LocalHub.apiRequest(`/posts/${encodeURIComponent(this.postId)}`);
        this.post = LocalHub.normalizePost(data);

        if (!this.contextPlaceId && this.post.placeIds?.[0]) {
          this.contextPlaceId = String(this.post.placeIds[0]);
        }
      } catch (error) {
        LocalHub.showToast(this, `게시글을 불러오지 못했습니다. ${error.message}`);
      } finally {
        this.loading = false;
      }
    },

    placeName(id) {
      return this.places.find((place) => place.id === String(id))?.name || '장소 미지정';
    },

    goPlace(id) {
      location.href = `/?placeId=${encodeURIComponent(id)}`;
    },

    goBack() {
      const params = new URLSearchParams();

      if (this.contextPlaceId) {
        params.set('placeId', this.contextPlaceId);
      }

      if (this.source) {
        params.set('from', this.source);
      }

      const query = params.toString();
      location.href = query ? `/board/?${query}` : '/board/';
    },

    async submitComment() {
      if (!this.commentForm.author || !this.commentForm.content || !this.commentForm.password) {
        LocalHub.showToast(this, '작성자, 내용, 비밀번호를 모두 입력해 주세요.');
        return;
      }

      this.loading = true;
      try {
        const comment = await LocalHub.apiRequest(
          `/posts/${encodeURIComponent(this.post.id)}/comments`,
          { method: 'POST', body: JSON.stringify(this.commentForm) }
        );
        const newComment = { ...comment, id: String(comment.id) };

        if (!this.post.comments.some((item) => item.id === newComment.id)) {
          this.post.comments.push(newComment);
        }

        this.post.commentCount = this.post.comments.length;
        this.commentForm = { author: '', content: '', password: '' };
        LocalHub.showToast(this, '댓글이 등록되었습니다.', 'success');
      } catch (error) {
        LocalHub.showToast(this, `댓글 등록에 실패했습니다. ${error.message}`);
      } finally {
        this.loading = false;
      }
    },

    requestCommentAction(action, comment) {
      this.actionModal = {
        open: true,
        target: 'comment',
        action,
        item: comment,
        content: comment.content,
        password: '',
        error: '',
      };
    },

    requestPostAction(action) {
      if (action === 'edit') {
        this.actionModal = {
          open: true,
          target: 'post',
          action,
          item: this.post,
          content: '',
          password: '',
          error: '',
        };
      } else {
        this.actionModal = {
          open: true,
          target: 'post',
          action,
          item: this.post,
          content: '',
          password: '',
          error: '',
        };
      }
    },

    closeActionModal() {
      this.actionModal.open = false;
    },

    async confirmAction() {
      if (!this.actionModal.password) {
        this.actionModal.error = '비밀번호를 입력해 주세요.';
        return;
      }

      if (this.actionModal.target === 'post' && this.actionModal.action === 'edit') {
        sessionStorage.setItem(
          'localhub-edit-password',
          this.actionModal.password
        );

        const params = new URLSearchParams({
          id: String(this.post.id),
          from: 'post',
        });

        if (this.contextPlaceId) {
          params.set('placeId', this.contextPlaceId);
        }

        location.href = `/write/?${params.toString()}`;
        return;
      }

      this.loading = true;
      try {
        if (this.actionModal.target === 'post') {
          await LocalHub.apiRequest(`/posts/${encodeURIComponent(this.post.id)}`, {
            method: 'DELETE',
            body: JSON.stringify({ password: this.actionModal.password }),
          });
          LocalHub.showToast(this, '게시글이 삭제되었습니다.', 'success');
          setTimeout(() => {
            const params = new URLSearchParams();

            if (this.contextPlaceId) {
              params.set('placeId', this.contextPlaceId);
            }

            location.replace(
              params.toString()
                ? `/board/?${params.toString()}`
                : '/board/'
            );
          }, 500);
          return;
        }

        const commentId = encodeURIComponent(this.actionModal.item.id);
        const basePath = `/posts/${encodeURIComponent(this.post.id)}/comments/${commentId}`;

        if (this.actionModal.action === 'edit') {
          const updated = await LocalHub.apiRequest(basePath, {
            method: 'PUT',
            body: JSON.stringify({
              content: this.actionModal.content,
              password: this.actionModal.password,
            }),
          });
          const index = this.post.comments.findIndex(
            (comment) => comment.id === String(this.actionModal.item.id)
          );
          if (index >= 0) {
            this.post.comments.splice(index, 1, {
              ...this.post.comments[index],
              ...updated,
              id: String(updated.id ?? this.actionModal.item.id),
            });
          }
          LocalHub.showToast(this, '댓글이 수정되었습니다.', 'success');
        } else {
          await LocalHub.apiRequest(basePath, {
            method: 'DELETE',
            body: JSON.stringify({ password: this.actionModal.password }),
          });
          this.post.comments = this.post.comments.filter(
            (comment) => comment.id !== String(this.actionModal.item.id)
          );
          this.post.commentCount = this.post.comments.length;
          LocalHub.showToast(this, '댓글이 삭제되었습니다.', 'success');
        }

        this.closeActionModal();
      } catch (error) {
        this.actionModal.error = error.message;
        LocalHub.showToast(this, `처리에 실패했습니다. ${error.message}`);
      } finally {
        this.loading = false;
      }
    },
  },
}).mount('#app');
