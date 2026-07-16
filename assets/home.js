function weatherAppearance(code, precipitationType = 0) {
  if (Number(precipitationType) === 3 || Number(precipitationType) === 7) {
    return { condition: '눈', icon: '🌨️' };
  }
  if (Number(precipitationType) > 0) {
    return { condition: '비', icon: '🌧️' };
  }
  if (Number(code) === 1 || Number(code) === 0) {
    return { condition: '맑음', icon: '☀️' };
  }
  if (Number(code) === 3 || (Number(code) >= 1 && Number(code) <= 3)) {
    return { condition: '구름많음', icon: '⛅' };
  }
  if (Number(code) === 4 || Number(code) >= 45) {
    return { condition: '흐림', icon: '☁️' };
  }
  return { condition: '맑음', icon: '🌤️' };
}

function kmaBaseDateTime() {
  const kst = new Date(Date.now() + (9 * 60 - 60) * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  const hour = String(kst.getUTCHours()).padStart(2, '0');

  return { baseDate: `${year}${month}${day}`, baseTime: `${hour}30` };
}

createApp({
  data() {
    return {
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
        weather: false,
      },
      weather: {
        temperature: null,
        humidity: null,
        windSpeed: null,
        precipitation: '0mm',
        condition: '',
        icon: '🌤️',
        updatedAt: '',
        source: '',
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

    this.fetchWeather();

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
          size: '5000',
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

    async fetchWeather() {
      this.loading.weather = true;

      try {
        if (window.APP_CONFIG?.KMA_SERVICE_KEY) {
          try {
            this.weather = await this.fetchKmaWeather();
            return;
          } catch (error) {
            console.warn('기상청 날씨 호출 실패, 대체 API를 사용합니다.', error);
          }
        }

        this.weather = await this.fetchFallbackWeather();
      } catch (error) {
        console.error('날씨 정보를 불러오지 못했습니다.', error);
        this.weather.temperature = null;
      } finally {
        this.loading.weather = false;
      }
    },

    async fetchKmaWeather() {
      const config = window.APP_CONFIG || {};
      const { baseDate, baseTime } = kmaBaseDateTime();
      const params = new URLSearchParams({
        pageNo: '1',
        numOfRows: '1000',
        dataType: 'JSON',
        base_date: baseDate,
        base_time: baseTime,
        nx: String(config.KMA_GRID_X || 84),
        ny: String(config.KMA_GRID_Y || 96),
      });
      const serviceKey = String(config.KMA_SERVICE_KEY || '');
      const authQueryName = String(config.KMA_AUTH_QUERY_NAME || 'ServiceKey');
      params.set(authQueryName, serviceKey);
      const baseUrl = String(config.KMA_API_BASE_URL || '').replace(/\/$/, '');
      const response = await fetch(
        `${baseUrl}/getUltraSrtFcst?${params}`
      );
      const responseText = await response.text();
      let data;

      try {
        data = JSON.parse(responseText);
      } catch {
        const message = responseText.trim().slice(0, 120) || '응답 본문 없음';
        throw new Error(`기상청 API 오류 (${response.status}): ${message}`);
      }

      const header = data?.response?.header;

      if (!response.ok || header?.resultCode !== '00') {
        throw new Error(header?.resultMsg || `기상청 API 오류 (${response.status})`);
      }

      const items = data?.response?.body?.items?.item || [];
      const forecasts = new Map();

      items.forEach((item) => {
        const key = `${item.fcstDate}${item.fcstTime}`;
        if (!forecasts.has(key)) forecasts.set(key, {});
        forecasts.get(key)[item.category] = item.fcstValue;
      });

      const [forecastKey, values] = [...forecasts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))[0] || [];

      if (!values || values.T1H === undefined) {
        throw new Error('기상청 예보 데이터가 없습니다.');
      }

      const appearance = weatherAppearance(values.SKY, values.PTY);
      const precipitation = values.RN1 && values.RN1 !== '강수없음'
        ? values.RN1.includes('mm') ? values.RN1 : `${values.RN1}mm`
        : '0mm';
      const hour = forecastKey?.slice(8, 10) || '--';
      const minute = forecastKey?.slice(10, 12) || '--';

      return {
        temperature: Math.round(Number(values.T1H)),
        humidity: Math.round(Number(values.REH)),
        windSpeed: Number(values.WSD || 0).toFixed(1),
        precipitation,
        ...appearance,
        updatedAt: `${hour}:${minute}`,
        source: '기상청',
      };
    },

    async fetchFallbackWeather() {
      const config = window.APP_CONFIG || {};
      const params = new URLSearchParams({
        latitude: String(config.GUMI_LATITUDE || 36.1195),
        longitude: String(config.GUMI_LONGITUDE || 128.3446),
        current: 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
        wind_speed_unit: 'ms',
        timezone: 'Asia/Seoul',
      });
      const response = await fetch(`${config.WEATHER_FALLBACK_URL}?${params}`);
      const data = await response.json();

      if (!response.ok || !data?.current) {
        throw new Error(`대체 날씨 API 오류 (${response.status})`);
      }

      const current = data.current;
      const weatherCode = Number(current.weather_code);
      let precipitationType = 0;
      if (weatherCode >= 71 && weatherCode <= 77) precipitationType = 3;
      else if (weatherCode >= 51) precipitationType = 1;

      return {
        temperature: Math.round(Number(current.temperature_2m)),
        humidity: Math.round(Number(current.relative_humidity_2m)),
        windSpeed: Number(current.wind_speed_10m || 0).toFixed(1),
        precipitation: `${Number(current.precipitation || 0).toFixed(1)}mm`,
        ...weatherAppearance(weatherCode, precipitationType),
        updatedAt: String(current.time || '').slice(11, 16),
        source: 'Open-Meteo',
      };
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
          } else if (!saved) {
            this.fitMarkers();
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

      const validPlaces = this.filteredPlaces;

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

    async sharePlace(place) {
      const url = `${LocalHub.shareBaseUrl()}/?placeId=${encodeURIComponent(place.id)}`;
      const text = `"${place.name}"을 추천합니다\n${url}`;

      try {
        await LocalHub.copyText(text);
        LocalHub.showToast(this, '공유 링크가 복사되었습니다.', 'success');
      } catch (error) {
        LocalHub.showToast(this, error.message);
      }
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
