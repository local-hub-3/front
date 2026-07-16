# LocalHub clean routes version

## 주소 구조

- 지도 홈: `/`
- 게시판: `/board/`
- 게시글 상세: `/post/?id={postId}&placeId={placeId}`
- 작성/수정: `/write/` 또는 `/write/?id={postId}`

각 페이지는 폴더 내부의 `index.html`로 구성되어 Netlify에서 확장자 없는 주소를 사용합니다.

## 폴더 구조

```text
/
├─ index.html
├─ board/
│  └─ index.html
├─ post/
│  └─ index.html
├─ write/
│  └─ index.html
├─ assets/
│  ├─ style.css
│  ├─ config.js
│  ├─ shared.js
│  ├─ kakao-loader.js
│  ├─ home.js
│  ├─ board.js
│  ├─ post.js
│  └─ write.js
└─ netlify.toml
```

## UI 변경

- 최근 게시글과 구미시 날씨 패널은 데스크톱에서 1:1 너비입니다.
- 우측 상단 게시판 버튼을 제거했습니다.
- 테마 전환은 해와 달 이모지를 사용한 스위치입니다.
- 900px 이하 화면에서는 최근 게시글과 날씨 패널이 한 열로 배치됩니다.

## 공유 및 날씨 설정

- 장소 팝업과 게시글 상세의 `공유하기` 버튼은 제목과 운영 링크를 클립보드에 복사합니다.
- 공유 링크의 도메인은 `assets/config.js`의 `SITE_BASE_URL`에서 변경할 수 있습니다.
- 기상청 단기예보를 사용하려면 공공데이터포털의 일반 인증키(Decoding)를 `KMA_SERVICE_KEY`에 입력합니다.
- 인증키가 비어 있거나 기상청 호출이 실패하면 Open-Meteo의 구미시 현재 날씨를 표시합니다.

## Netlify

Build command는 비워두고 Publish directory는 `.`으로 설정합니다.


## 장소 URL 문맥 정리

지도 주소가 `/ ?placeId=...` 상태일 때 다음 동작을 수행하면 URL에서
`placeId`와 `from`을 제거합니다.

- 장소 팝업의 `×`
- 장소 팝업의 `← 지도`
- 팝업 바깥 영역 클릭
- 좌측 상단 LocalHub 로고 클릭

로고 클릭 시에는 페이지를 새로고침하지 않고 전체 장소 표시와 기본 지도 위치로 돌아갑니다.


## 지역 필터 변경

- 상단 지역 선택 UI 제거
- 전체 지역 장소 표시
- 구미 주소/좌표 제한 제거
- 장소 분류에서 여행 코스 제거
- 게시글 많은 곳 분류 제거


## 전체 지역 제한 제거

- 모든 페이지의 상단 지역 선택 UI를 제거했습니다.
- 장소 API 요청에서 `region=구미`를 제거했습니다.
- 장소 조회 크기를 `5000`으로 확대했습니다.
- 프론트의 `isGumiPlace()` 지역 필터를 제거했습니다.
- 챗봇 요청에서 `region` 필드를 제거했습니다.
- 저장된 지도 위치가 없으면 첫 진입 시 전체 장소 범위에 맞춰 지도를 표시합니다.
