const { createApp } = Vue;

const LocalHub = {
  apiBaseUrl: (window.APP_CONFIG?.API_BASE_URL || 'http://localhost:8080/api').replace(/\/$/, ''),
  requestTimeoutMs: Number(window.APP_CONFIG?.REQUEST_TIMEOUT_MS) || 10000,

  createId() {
    return globalThis.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  },

  getInitialTheme() {
    const savedTheme = localStorage.getItem('localhub-theme');
    const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    return savedTheme || (systemDark ? 'dark' : 'light');
  },

  applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('localhub-theme', theme);
  },

  toggleTheme(currentTheme) {
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(nextTheme);
    return nextTheme;
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
      const body = contentType.includes('application/json')
        ? await response.json()
        : null;

      if (!response.ok) {
        const error = new Error(
          // body?.message || `서버 요청에 실패했습니다. (${response.status})`
          body?.message || `비밀번호가 일치하지 않습니다.`
        );
        // error.status = response.status;
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
    let latitude = Number(place.latitude ?? place.mapy);
    let longitude = Number(place.longitude ?? place.mapx);

    // 서버에서 mapx/mapy 또는 위도/경도를 반대로 매핑한 경우 자동 보정합니다.
    if (
      Math.abs(latitude) > 90 &&
      Math.abs(longitude) <= 90
    ) {
      [latitude, longitude] = [longitude, latitude];
    }

    const address =
      place.address ??
      [place.addr1, place.addr2].filter(Boolean).join(' ');

    return {
      ...place,
      id: String(place.id ?? place.contentid ?? ''),
      contentTypeId: String(place.contentTypeId ?? place.contenttypeid ?? ''),
      name: place.name ?? place.title ?? '이름 없는 장소',
      category: place.category ?? place.contentType ?? '기타',
      address,
      telephone: place.telephone ?? place.tel ?? '',
      latitude,
      longitude,
      image: place.image ?? place.firstimage ?? '',
      thumbnail: place.thumbnail ?? place.firstimage2 ?? place.firstimage ?? '',
      categoryIcon:
        place.categoryIcon ||
        this.categoryIcon(place.category ?? place.contentType),
    };
  },
  buildContextQuery(context = {}) {
    const params = new URLSearchParams();

    if (context.placeId) {
      params.set('placeId', String(context.placeId));
    }

    if (context.from) {
      params.set('from', context.from);
    }

    const query = params.toString();
    return query ? `?${query}` : '';
  },

  normalizePost(post) {
    return {
      ...post,
      id: String(post.id),
      placeIds: Array.from(new Set(
        (post.placeIds || post.placeId ? [ ...(post.placeIds || []), ...(post.placeId ? [post.placeId] : []) ] : [])
          .map(String)
          .filter(Boolean)
      )),
      comments: Array.from(
        new Map(
          (post.comments || []).map((comment) => [
            String(comment.id ?? `${comment.author}-${comment.content}`),
            {
              ...comment,
              id: String(comment.id),
            },
          ])
        ).values()
      ),
      commentCount: post.commentCount ?? post.comments?.length ?? 0,
      views: post.views ?? 0,
    };
  },

  categoryIcon(category) {
    return ({
      전체: '🗺️',
      관광지: '📍',
      음식점: '🍽️',
      축제공연행사: '🎉',
      문화시설: '🎨',
      레포츠: '🏃',
      숙박: '🏨',
      쇼핑: '🛍️',
    })[category] || '📌';
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

  createToastState() {
    return {
      visible: false,
      message: '',
      type: 'error',
      timer: null,
    };
  },

  showToast(vm, message, type = 'error') {
    clearTimeout(vm.toast.timer);
    vm.toast.visible = true;
    vm.toast.message = message;
    vm.toast.type = type;
    vm.toast.timer = setTimeout(() => {
      vm.toast.visible = false;
    }, 3000);
  },

  hideToast(vm) {
    clearTimeout(vm.toast.timer);
    vm.toast.visible = false;
  },

  getQuery(name) {
    return new URLSearchParams(window.location.search).get(name);
  },

  go(url) {
    window.location.href = url;
  },
};

window.LocalHub = LocalHub;
