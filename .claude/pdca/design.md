# PDCA Design: adm.hn-000.com 관리자 로그인 페이지 미표시 문제

## 아키텍처 분석

### 프론트엔드 빌드 구조
```
frontend/
├── admin.html         → 관리자 진입점
├── index.html         → 유저 진입점
├── src/
│   ├── admin-main.tsx → AdminEntry 렌더링
│   ├── AdminEntry.tsx → 로그인/인증 컴포넌트
│   └── AdminApp.tsx   → 관리자 대시보드 (메인 코드)
└── dist/              → 빌드 결과물
    ├── admin.html
    ├── index.html
    └── assets/
        ├── admin-CnfXHCN4.js   ← 문제 파일
        ├── badge-BSkGiSOJ.js    (공통 라이브러리)
        ├── badge-BLttO06Y.css
        └── main-2Ayfp4Fn.js    (유저 페이지)
```

### 배포 구조
- 서버: 172.235.193.234 (qna-board 유저)
- 배포 경로: /home/qna-board/
- 도메인: adm.hn-000.com (관리자), hn-000.com (유저)
- CDN: Cloudflare

## 수정 계획

### Step 1: 프론트엔드 재빌드
- 소스코드 변경 없음 (코드 자체는 정상)
- `vite build`로 최신 빌드 생성

### Step 2: 서버 배포
- scp 또는 git pull로 최신 dist 파일을 서버에 배포
- 기존 deploy 스킬 활용

### Step 3: 캐시 클리어
- Cloudflare 캐시 퍼지 (동일 파일명 캐시 방지)
- 브라우저 강제 새로고침으로 확인

## 리스크
- 동일 파일명(`admin-CnfXHCN4.js`)으로 Cloudflare 캐시가 오래된 파일 제공 가능
  → 빌드 후 파일 해시 변경 확인 필요
