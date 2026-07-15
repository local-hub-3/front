(() => {
  let sdkPromise = null;

  function waitForKakaoMaps(timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();

      const check = () => {
        if (
          window.kakao?.maps &&
          typeof window.kakao.maps.Map === 'function' &&
          typeof window.kakao.maps.LatLng === 'function'
        ) {
          resolve(window.kakao.maps);
          return;
        }

        if (Date.now() - startedAt >= timeoutMs) {
          reject(
            new Error(
              '카카오 지도 SDK 파일은 로드됐지만 지도 객체가 준비되지 않았습니다.'
            )
          );
          return;
        }

        window.setTimeout(check, 50);
      };

      check();
    });
  }

  window.loadKakaoMapSdk = function loadKakaoMapSdk() {
    if (
      window.kakao?.maps &&
      typeof window.kakao.maps.Map === 'function'
    ) {
      return Promise.resolve(window.kakao.maps);
    }

    if (sdkPromise) {
      return sdkPromise;
    }

    sdkPromise = new Promise((resolve, reject) => {
      const appKey = String(
        window.APP_CONFIG?.KAKAO_MAP_JS_KEY || ''
      ).trim();

      if (
        !appKey ||
        appKey === '여기에_카카오_JavaScript_키를_입력하세요'
      ) {
        reject(
          new Error(
            'config.js에 올바른 KAKAO_MAP_JS_KEY를 설정해 주세요.'
          )
        );
        return;
      }

      const finishLoading = async () => {
        try {
          if (!window.kakao?.maps) {
            throw new Error(
              '카카오 지도 전역 객체가 생성되지 않았습니다.'
            );
          }

          // autoload=false일 때 내부 모듈 초기화가 완료된 후 resolve합니다.
          window.kakao.maps.load(async () => {
            try {
              const maps = await waitForKakaoMaps();
              resolve(maps);
            } catch (error) {
              reject(error);
            }
          });
        } catch (error) {
          reject(error);
        }
      };

      const existingScript = document.querySelector(
        'script[data-kakao-map-sdk="true"]'
      );

      if (existingScript) {
        if (existingScript.dataset.loaded === 'true') {
          finishLoading();
          return;
        }

        existingScript.addEventListener(
          'load',
          finishLoading,
          { once: true }
        );

        existingScript.addEventListener(
          'error',
          () => reject(
            new Error(
              '카카오 지도 SDK 요청이 차단됐습니다. JavaScript 키, SDK 도메인, 광고 차단 확장 프로그램을 확인해 주세요.'
            )
          ),
          { once: true }
        );
        return;
      }

      const script = document.createElement('script');
      script.dataset.kakaoMapSdk = 'true';
      script.async = false;
      script.defer = false;
      script.src =
        'https://dapi.kakao.com/v2/maps/sdk.js' +
        `?autoload=false&appkey=${encodeURIComponent(appKey)}`;

      script.addEventListener(
        'load',
        () => {
          script.dataset.loaded = 'true';
          finishLoading();
        },
        { once: true }
      );

      script.addEventListener(
        'error',
        () => {
          sdkPromise = null;
          reject(
            new Error(
              '카카오 지도 SDK를 불러오지 못했습니다. JavaScript 키와 등록 도메인을 확인해 주세요.'
            )
          );
        },
        { once: true }
      );

      document.head.appendChild(script);
    }).catch((error) => {
      sdkPromise = null;
      throw error;
    });

    return sdkPromise;
  };
})();
