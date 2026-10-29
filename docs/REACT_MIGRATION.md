# React 이주 기록

## 범위

2026-10-29, 기존 기능과 밝은 CSS 유리 디자인을 보존하는 React 이주를 진행했다.
그룹·초대·댓글·메달 투표 개편과 기존 방문 인증 제거는 후속 단계다.
Supabase 스키마와 운영 데이터는 이번 이주에서 변경하지 않았다.

## 실행

Node.js 22.12 이상(배포 환경은 24)을 사용한다.

```sh
npm ci
cp outputs/ccatalog/public/config.example.json outputs/ccatalog/public/config.json
# config.json에 브라우저용 설정 입력
npm run dev
```

개발 주소: http://127.0.0.1:4174/
다른 서버가 4174를 사용 중이면 먼저 종료하거나 별도 포트의 지도·인증 허용 주소를 준비한다.
같은 배포 빌드가 4174에서는 정상 동작했고, 별도 검증 포트 4175에서는 네이버 SDK가 로드 후 비활성화되는 현상을 확인했다.
현재 허용 목록 전체를 콘솔에서 조회한 것은 아니므로 새 주소의 사용 가능 여부는 별도로 확인한다.

기존 `outputs/ccatalog/config.json`이 있는 환경에서는 그 파일을 `outputs/ccatalog/public/config.json`으로 복사한다.
설정 키는 `naverMapKey`, `supabaseUrl`, `supabaseAnonKey` 그대로다.
이 파일은 Git에 포함되지 않는다. 서버 검색 비밀 키는 기존 Edge Function에서 관리한다.
OAuth의 사용자 정의 provider `custom:kakao-test`, 인증 저장 키 `ccatalog.supabase.auth`와 튜토리얼 저장 키를 보존했다.

```sh
npm test
npx playwright install chromium webkit
npm run test:e2e
npm run build
npm run preview
```

## 구조

| 경로 | 역할 |
| --- | --- |
| `outputs/ccatalog/src/main.jsx` | React 진입점 |
| `outputs/ccatalog/src/App.jsx` | 선택 식당, 패널, 모달, 필터 등 화면 상태와 사용자 동작 연결 |
| `outputs/ccatalog/src/components/` | 목록/상세, 계정, 독, 등록 폼, 사진, 건의 심사, 튜토리얼 |
| `outputs/ccatalog/src/hooks/useCatalog.js` | 설정, Supabase 데이터, 인증 구독과 정리 |
| `outputs/ccatalog/src/hooks/useMap.js` | 지도 생성/정리, 위치 구독, 초기 현재 위치와 자동 줌 |
| `outputs/ccatalog/src/services/` | 데이터 저장소, 장소 검색, 지도 SDK 어댑터 |
| `outputs/ccatalog/src/lib/` | 기존 데이터 정규화, 거리 계산, 사진 압축 등 공통 로직 |
| `outputs/ccatalog/public/` | 아이콘, 로고, 폰트, 런타임 설정 |
| `tests/` | 데이터 변환 및 브라우저 회귀 테스트 |

기존 `render()`와 UI 문자열 재생성은 React 컴포넌트 렌더링으로 이동했다.
지도 SDK 객체, 독의 픽셀 단위 위치와 드래그 피드백은 React 수명 주기/refs 안에서 관리한다.
네이버 식당 마커는 식당 ID로 재사용하고 변경된 아이콘만 갱신한다. 제거된 마커의 이벤트도 정리한다.
장소 검색은 입력이 바뀌거나 창이 닫히면 이전 요청을 취소한다.
등록/사진/심사/방문 동작은 중복 제출을 방지한다.

## 보존한 흐름

- 지도와 식당 핀, 검색/메달 필터, 목록과 상세 카드
- 현재 위치, 근처 식당 자동 줌, 카드 상단을 고려한 지도 이동
- 독의 누름/드래그 확대, 놓을 때 필터 확정, 검색/필터 모핑
- 카카오 로그인/로그아웃과 일반회원·까탈리스트·관리자 모드
- 검색된 장소 선택 필수, 이름 입력 중 Enter 검색, 메뉴/가격과 배달 앱
- 식당 등록/수정/삭제, 사진 업로드/정렬/삭제/뷰어
- 위치 확인 후 메달 동의, 방문 집계와 기존 승급
- 음식점 건의/승인/반려, 첫 방문 튜토리얼

## 검증

- Node 데이터 변환 테스트 4개: 메뉴 정규화, 가격, 배달 앱, 거리 경계, 기존 기록 호환
- Playwright 테스트 20개: 동일한 주요 흐름을 데스크톱 Chromium과 모바일 WebKit에서 검증
- 초기 현재 위치와 선택 핀이 카드 위 가시 영역 중앙에 오는지 좌표 비교
- 계정/검색 변화 중 지도를 재생성하지 않는지 검증
- 자동 등록/삭제/사진/방문 인증/건의 심사 테스트는 가짜 API와 지도 SDK를 사용해 운영 데이터와 격리
- `tools/verify-live.mjs`: 실제 지도와 Supabase 공개 데이터에 대한 읽기 전용 브라우저 확인

실제 카카오 계정으로 로그인하는 마지막 동의/복귀 과정은 사용자 세션에서 재확인이 필요하다.
자동 테스트에서는 기존 provider와 복귀 URL, 로그인/로그아웃 UI 연결을 검증한다.
모바일 WebKit 테스트는 실제 iPhone 기기 검증을 대체하지 않는다.

## 배포

GitHub Actions가 `npm ci`와 데이터 변환 테스트를 수행한 뒤 공개 설정을 `public/config.json`으로 생성한다.
Vite 빌드는 Pages 기본 경로 `/ccatalog/`로 생성하고 `dist/`만 배포한다.
원본 JS, SQL, 테스트 파일은 정적 배포 산출물에 포함되지 않는다.

## 배포 CSS 블러 회귀 수정

React 이주 배포 후 CSS 압축기가 표준 `backdrop-filter`를 제거하고 접두사 선언만 남기는 문제가 확인됐다.
Chromium의 계산된 블러 값이 `none`이 되어 유리 표면이 단순 투명 배경으로 표시됐다.
모든 블러 선언을 `-webkit-backdrop-filter` 다음에 표준 선언이 오도록 정리했다.
`npm test`에 실제 Vite 빌드 결과를 검사하는 회귀 테스트를 추가했다.
`npm run build` 후 `npm run test:glass`로 압축 CSS를 Chromium과 모바일 WebKit에서 검사할 수 있다.
Chromium은 블러를 켜고 끈 스크린샷의 픽셀 차이까지 비교한다.
현재 Playwright WebKit 환경은 최소 재현 화면에서도 블러를 스크린샷에 그리지 않아, 해당 환경에서는 두 선언의 계산된 스타일을 검증한다.
실제 iPhone의 시각 확인은 별도로 필요하다.

## 다음 단계

`DEVELOPMENT_HANDOFF.md`의 미확정 그룹 권한과 투표 정책을 확인하고, 그룹/초대/RLS/사진 비공개 접근부터 설계한다.
기획서는 그 과정의 결정 기록을 바탕으로 사이트 개편 후 작성한다.
