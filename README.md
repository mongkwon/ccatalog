# 까탈로그

취향에 엄격한 맛집 지도 앱입니다. 네이버 지도 위에 맛집 핀을 표시하고, 별 0개부터 3개까지의 평가와 추천 메뉴, 배달 가능 앱을 기록합니다.

## 배포

이 저장소는 GitHub Actions로 `outputs/ccatalog` 폴더를 GitHub Pages에 배포합니다.

1. GitHub 저장소의 `Settings > Pages`로 이동합니다.
2. `Build and deployment`의 `Source`를 `GitHub Actions`로 설정합니다.
3. `main` 브랜치에 push하면 자동 배포됩니다.

배포 전에 GitHub 저장소의 `Settings > Secrets and variables > Actions`에서 repository secret을 추가합니다.

```text
Name: NAVER_MAP_KEY
Value: 네이버 Maps JavaScript API ncpKeyId
```

Supabase 저장을 사용할 때는 아래 secret도 추가합니다.

```text
Name: SUPABASE_URL
Value: https://프로젝트ID.supabase.co

Name: SUPABASE_ANON_KEY
Value: Supabase anon public key
```

배포 예상 URL:

```text
https://mongkwon.github.io/ccatalog/
```

## Supabase 설정

까탈로그는 Supabase가 설정되어 있으면 DB를 사용하고, 설정이 없거나 연결에 실패하면 로컬 브라우저 저장소로 동작합니다.

1. Supabase에서 새 프로젝트를 만듭니다.
2. `Authentication > Sign In / Providers`에서 `Anonymous Sign-Ins`를 켭니다.
3. `SQL Editor`에서 [supabase/schema.sql](./supabase/schema.sql)을 그대로 실행합니다.
4. `Project Settings > API Keys > Legacy anon, service_role API keys`에서 `anon public` key를 확인합니다.
5. GitHub Actions secret 또는 로컬 `outputs/ccatalog/config.json`에 `SUPABASE_URL`, `SUPABASE_ANON_KEY` 값을 넣습니다.

브라우저 앱에는 Legacy 탭의 `anon public` key만 넣습니다. 현재 Edge Function은 JWT 검증을 사용하므로 `sb_publishable_...` 형식의 새 Publishable key가 아니라 JWT 형식의 `anon` key를 사용합니다. `service_role` key나 `sb_secret_...` key는 RLS를 우회하므로 절대 클라이언트 코드, GitHub Pages, Vercel 환경 변수에 넣지 않습니다.

현재 RLS 정책은 공개 읽기, 익명 로그인 사용자별 생성/수정/삭제입니다. 즉 지도에 올라온 맛집은 누구나 볼 수 있고, 수정/삭제는 그 항목을 만든 브라우저 세션에서만 가능합니다.

### 장소 검색 Edge Function

맛집 추가창의 장소 검색은 Supabase Edge Function인 `naver-place-search`를 호출합니다. 이 함수는 네이버 지역 검색 API의 Client Secret을 숨기기 위한 서버 프록시입니다.

네이버 클라우드 지도 키와 네이버 개발자 센터 검색 API 키는 서로 다릅니다. 장소 검색을 쓰려면 [네이버 개발자 센터](https://developers.naver.com/)에서 애플리케이션을 만들고 `검색` API 권한을 켠 뒤 Client ID와 Client Secret을 발급받습니다.

Supabase CLI로 프로젝트를 연결하고 함수를 배포합니다.

```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref 프로젝트REF
supabase secrets set NAVER_SEARCH_CLIENT_ID=발급받은_CLIENT_ID NAVER_SEARCH_CLIENT_SECRET=발급받은_CLIENT_SECRET
supabase functions deploy naver-place-search
```

함수는 앱의 `supabaseUrl` 값에서 아래 주소를 자동으로 계산해 호출합니다.

```text
https://프로젝트ID.supabase.co/functions/v1/naver-place-search
```

## 네이버 지도 설정

네이버 클라우드 플랫폼 콘솔에서 Maps JavaScript API를 활성화하고, Web 서비스 URL에 아래 주소를 등록합니다.

```text
http://localhost:4173
http://127.0.0.1:4173
https://mongkwon.github.io
https://mongkwon.github.io/ccatalog
```

코드는 최신 Maps JavaScript API 방식인 `ncpKeyId` 파라미터를 사용합니다.

```html
https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=...
```

Figma의 `*.figma.site` 배포 주소는 프록시/Referer 문제로 네이버 지도 인증이 막힐 수 있으므로 배포 테스트에는 GitHub Pages나 Vercel 같은 직접 소유 가능한 도메인을 사용합니다.

## 로컬 실행

정적 파일만 사용하므로 간단한 정적 서버로 실행하면 됩니다.

먼저 로컬 전용 설정 파일을 만듭니다. 이 파일은 git에 올리지 않습니다.

```json
{
  "naverMapKey": "네이버 Maps JavaScript API ncpKeyId",
  "supabaseUrl": "https://프로젝트ID.supabase.co",
  "supabaseAnonKey": "Supabase Legacy anon public key"
}
```

파일 위치:

```text
outputs/ccatalog/config.json
```

```bash
npx serve outputs/ccatalog
```

또는 현재 작업 중인 Vite preview 서버를 계속 사용해도 됩니다.
