window.loadKakaoMapSdk = function loadKakaoMapSdk() {
  return new Promise((resolve, reject) => {
    if (window.kakao?.maps) {
      window.kakao.maps.load(resolve);
      return;
    }

    const appKey = window.APP_CONFIG?.KAKAO_MAP_JS_KEY;

    if (
      !appKey ||
      appKey === '여기에_카카오_JavaScript_키를_입력하세요'
    ) {
      reject(
        new Error(
          'config.js에 KAKAO_MAP_JS_KEY를 설정해 주세요.'
        )
      );
      return;
    }

    const existing = document.querySelector(
      'script[data-kakao-map-sdk]'
    );

    if (existing) {
      existing.addEventListener('load', () => {
        window.kakao.maps.load(resolve);
      });
      existing.addEventListener('error', () => {
        reject(new Error('카카오 지도 SDK를 불러오지 못했습니다.'));
      });
      return;
    }

    const script = document.createElement('script');
    script.dataset.kakaoMapSdk = 'true';
    script.async = true;
    script.src =
      `https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&appkey=${encodeURIComponent(appKey)}`;

    script.onload = () => {
      if (!window.kakao?.maps) {
        reject(new Error('카카오 지도 객체를 찾을 수 없습니다.'));
        return;
      }

      window.kakao.maps.load(resolve);
    };

    script.onerror = () => {
      reject(
        new Error(
          '카카오 지도 SDK를 불러오지 못했습니다. 키와 등록 도메인을 확인해 주세요.'
        )
      );
    };

    document.head.appendChild(script);
  });
};
