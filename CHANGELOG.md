# QNA Board 작업내역

## 2026-02-09

### AI 자동 분석 파이프라인 + 서버 관리 기능 추가 (`52a4c00`)
- Claude Code CLI 기반 AI 자동 분석 cron 구현 (`api/cron/ai_processor.php`)
  - 매 1분 실행, `registered` 상태 게시글 자동 감지 및 분석
  - lock 파일로 중복 실행 방지, 5분 초과 stale lock 자동 해제
  - 실패 시 `registered`로 자동 복구 (다음 cron에서 재시도)
  - 텔레그램 알림 (분석 완료/오류 발생 시)
- 서버 정보 DB 관리
  - `servers` 테이블 생성 (사이트명, IP, SSH/DB/사이트/관리자 접속 정보)
  - 비밀번호 AES-256-CBC 암호화 저장/복호화 조회
  - 관리자 API (`api/admin/servers.php`) CRUD 구현
- 대상 서버 SSH 실시간 진단 (`sshpass` 활용)
  - 서버 상태 14개 항목 자동 수집 (uptime, disk, memory, CPU, 웹서버, DB, 에러로그, HTTP 응답 등)
  - 진단 데이터를 AI 프롬프트에 포함하여 실제 데이터 기반 분석
- 관리자 승인/재확인 요청 워크플로우
  - `pending_approval` 상태에서 승인 처리 / 재확인 요청 분리 UI
  - 재확인 시 관리자 피드백을 반영한 AI 재분석
- 관리자 페이지 서버 관리 탭 추가
  - 서버 목록 카드형 표시, 상세 페이지 (SSH/DB/사이트/관리자 정보)
  - 비밀번호 마스킹 + 눈 아이콘 토글 + 클립보드 복사
  - 등록/수정/삭제 다이얼로그
- 사용자단 AI 참조 전면 제거
  - AI 배지 → "담당자" 배지로 변경
  - AI 분석 댓글 → 일반 안내 메시지로 대체
  - 처리 이력 → 간소화된 상태 메시지만 표시

### 유저 처리절차 라벨 변경 및 순서 조정 (`a557c77`)
- 사용자 화면의 처리절차 단계 라벨 한글화
- 단계 표시 순서 최적화

### 관리자 새 글 자동 감지 + 알림 기능 추가 (`abb7dde`)
- 30초 간격 자동 새로고침
- 새 문의글 등록 시 알림 배너 + 효과음
- 8초 후 자동 닫힘

### 처리절차 현재 단계 애니메이션 강화 + API 필드 매핑 수정 (`fdbe0ab`)
- 현재 진행 단계 글로우/바운스/펄스 애니메이션
- 하단 진행바 시머 효과
- API 필드명 매핑 호환성 처리

### 완료 상태에서 재작업/재검토 전환 추가 (`1ae7272`)
- `completed` 상태에서 재작업/재검토 단계 전환 버튼 추가

### 관리자 처리절차 카드형 UI로 개선 (`b3b59af`)
- 처리절차 목록 카드형 UI 개편
- 진행 박스 클릭 시 상세 페이지 이동
- 단계별 컬러/아이콘 시각화

### 처리절차 워크플로우 시스템 구현 (`5cb314e`)
- 7단계 워크플로우: registered → ai_review → pending_approval → ai_processing → completed / admin_confirm / rework
- 단계 전환 API (`api/process.php`)
- 처리 이력 타임라인
- 단계별 대시보드 카운트

### 관리자 페이지 /admin 경로로 분리 (`b133719`)
- admin.html 별도 엔트리포인트
- Nginx 설정에서 /admin 경로 라우팅
- Vite 멀티페이지 빌드 설정

### QNA 게시판 사용자/관리자 분리 + 자동답변 + 회원관리 (`ec96d23`)
- 사용자/관리자 페이지 분리 (UserApp / AdminApp)
- 세션 기반 인증 (로그인/로그아웃)
- 카테고리별 문의 (긴급/오류/건의/추가개발/기타)
- 관리자 답변 및 댓글 시스템
- 파일 첨부 (이미지/비디오/문서)
- 회원 관리 CRUD
- 텔레그램 알림 연동

## 2026-02-08

### Q&A 게시판 프로젝트 초기 커밋 (`a0421dc`)
- React 19 + TypeScript + Vite 7 + Tailwind CSS + shadcn/ui 프론트엔드
- PHP 8.4 + MySQL 8.4 + Nginx 1.28 백엔드
- 게시판 기본 CRUD API

---

## 기술 스택
- **Frontend**: React 19, TypeScript, Vite 7, Tailwind CSS, shadcn/ui
- **Backend**: PHP 8.4, MySQL 8.4, Nginx 1.28
- **AI**: Claude Code CLI (비대화형 모드)
- **Server**: Akamai Cloud (172.235.193.234)
- **배포**: `scp -r dist/* root@172.235.193.234:/home/qna-board/frontend/dist/`
