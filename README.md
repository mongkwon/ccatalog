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

배포 예상 URL:

```text
https://mongkwon.github.io/ccatalog/
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
  "naverMapKey": "네이버 Maps JavaScript API ncpKeyId"
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
