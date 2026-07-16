window.APP_CONFIG = {
  // 실제 백엔드 API 주소
  API_BASE_URL: 'https://backend-qthh.onrender.com/api',

  // Kakao Developers에서 발급받은 JavaScript 키
  KAKAO_MAP_JS_KEY: '542e2dc4a4eafbef7bd34f3b0d36f469',

  // 공유 링크에 사용할 운영 사이트 주소
  SITE_BASE_URL: 'https://gumi-community.netlify.app',

  // 공공데이터포털에서 발급받은 기상청 단기예보 일반 인증키(Decoding)를 입력하세요.
  // 키가 비어 있거나 API 호출에 실패하면 공개 날씨 API로 자동 대체됩니다.
  KMA_SERVICE_KEY: '735b1c729e77af14e509ff161e1d1f6fdebb7d5a5f4991075c871bd4d3f45e0d',
  KMA_API_BASE_URL: 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0',
  KMA_GRID_X: 84,
  KMA_GRID_Y: 96,
  WEATHER_FALLBACK_URL: 'https://api.open-meteo.com/v1/forecast',
  GUMI_LATITUDE: 36.1195,
  GUMI_LONGITUDE: 128.3446,

  REQUEST_TIMEOUT_MS: 10000
};
