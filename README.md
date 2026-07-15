# LocalHub 멀티 페이지 Netlify 버전

## 페이지 구조
- `index.html`: 지도 홈
- `board.html`: 게시글 목록
- `post.html?id={게시글ID}`: 게시글 상세
- `write.html`: 게시글 작성
- `write.html?id={게시글ID}`: 게시글 수정

## 지도 수정
- 지도는 `index.html`에서만 생성됩니다.
- 게시판으로 이동할 때 지도 DOM을 숨겼다가 다시 표시하지 않으므로 마커 좌표가 깨지지 않습니다.
- 지도 이동 및 줌 변경 시 중심 좌표와 줌을 `sessionStorage`에 저장합니다.
- 게시판에서 지도로 돌아오면 저장된 위치를 복원합니다.
- `ResizeObserver`와 `invalidateSize()`를 사용해 브라우저 크기 변경에도 마커와 타일 위치를 다시 계산합니다.

## Netlify 배포
별도 빌드 없이 폴더 전체를 Netlify에 업로드할 수 있습니다.

배포 전 `config.js`에서 실제 HTTPS 백엔드 URL을 설정하세요.


## 2026-07 컨텍스트 및 마커 보정

- 서버가 위도와 경도를 반대로 반환하면 자동으로 교환합니다.
- 주소에 구미가 포함되고 구미 좌표 범위 안에 있는 장소만 지도에 표시합니다.
- 장소 카테고리 변경 시 `invalidateSize()` 후 마커와 지도 범위를 재계산합니다.
- Leaflet 마커 wrapper의 `position`을 CSS에서 강제로 지정하지 않습니다.
- `placeId`를 지도 → 게시판 → 상세 → 작성/수정 페이지까지 쿼리 문자열로 유지합니다.
- 장소 게시판에서 글을 작성하면 작성 완료 후 해당 게시글 상세로 이동하며, 서버가 게시글 ID를 반환하지 않으면 해당 장소 게시판으로 돌아갑니다.
- 작성 요청에는 서버 DTO 호환을 위해 `placeId`와 `placeIds`를 함께 전달합니다.


## Kakao Maps 전환

### 설정

`config.js`에 Kakao Developers에서 발급받은 JavaScript 키를 입력합니다.

```js
window.APP_CONFIG = {
  API_BASE_URL: 'https://백엔드주소/api',
  KAKAO_MAP_JS_KEY: '카카오_JavaScript_키',
  REQUEST_TIMEOUT_MS: 10000
};
```

### Kakao Developers 도메인 등록

Kakao Developers의 앱 설정에서 다음 도메인을 JavaScript SDK 도메인으로 등록해야 합니다.

- 로컬 테스트 주소 예: `http://localhost:5500`
- Netlify 주소 예: `https://your-site.netlify.app`
- 커스텀 도메인을 사용하는 경우 해당 HTTPS 도메인

### 변경된 파일

- `index.html`: Leaflet CSS와 SDK 제거
- `kakao-loader.js`: 카카오 지도 SDK 동적 로딩
- `home.js`: Kakao Maps Map, CustomOverlay, LatLngBounds로 교체
- `style.css`: 카카오 지도 커스텀 마커 스타일 추가
- `config.js`: `KAKAO_MAP_JS_KEY` 항목 추가

게시판, 게시글 상세, 작성 페이지와 서버 API 구조는 기존과 동일합니다.
