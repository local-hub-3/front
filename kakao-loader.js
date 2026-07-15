window.loadKakaoMapSdk = function loadKakaoMapSdk() {
  return new Promise((resolve, reject) => {
    if (window.kakao?.maps) {
      try {
        window.kakao.maps.load(() => resolve());
      } catch (error) {
        resolve();
      }
      return;
    }

    const appKey = window.APP_CONFIG?.KAKAO_MAP_JS_KEY;

    if (!appKey || appKey === '여기에_카카오_JavaScript_키를_입력하세요') {
      reject(new Error('config.js에 KAKAO_MAP_JS_KEY를 설정해 주세요.'));
      return;
    }

    const existing = document.querySelector('script[data-kakao-map-sdk]');

    if (existing) {
      existing.addEventListener('load', () => {
        try {
          window.kakao.maps.load(() => resolve());
        } catch (error) {
          resolve();
        }
      });
      existing.addEventListener('error', () => {
        resolve();
      });
      return;
    }

    const script = document.createElement('script');
    script.dataset.kakaoMapSdk = 'true';
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&appkey=${encodeURIComponent(appKey)}`;

    script.onload = () => {
      if (!window.kakao?.maps) {
        resolve();
        return;
      }

      try {
        window.kakao.maps.load(() => resolve());
      } catch (error) {
        resolve();
      }
    };

    script.onerror = () => {
      resolve();
    };

    document.head.appendChild(script);
  });
};
