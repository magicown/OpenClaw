# 최종 보고서: Q&A 게시판 AI 처리 파이프라인 분석

## 전체 파이프라인 요약

```
유저 글 등록 → Cron 감지(1분) → 서버 SSH 진단 → Claude Code CLI 분석 → 결과 저장 → 관리자 검토
```

---

## 1. 글이 클로드코드에게 전달되는 과정

### 1-1. 유저가 글 등록 (api/posts.php)
- POST /api/posts.php 로 제목/내용/카테고리 전송
- DB에 status='registered'로 저장
- 자동 댓글 생성 + Telegram 관리자 알림

### 1-2. Cron Job이 글 감지 (api/cron/ai_processor.php)
- 매 1분마다 실행: `* * * * * /usr/bin/php ai_processor.php`
- status='registered'인 글을 최대 5건 조회 (오래된 순)
- 중복 방지: /tmp/ai_processor.lock (5분 stale lock 자동 제거)

### 1-3. 서버 정보 수집
- 유저의 site 정보로 servers 테이블에서 서버 정보 조회
- 암호화된 비밀번호 복호화 (AES-256-CBC)
- SSH로 서버에 접속하여 14개 진단 항목 실시간 수집
  (uptime, disk, memory, CPU, 웹서버, MySQL, 에러로그, PHP-FPM, 포트, HTTP체크, DB체크 등)

### 1-4. Claude Code CLI 호출
- 명령: `/usr/local/bin/claude -p '{프롬프트}' --output-format text`
- 프롬프트에 포함되는 정보:
  1. 관리자 재확인 피드백 (재분석 시)
  2. 대상 서버 정보 (IP, URL, 관리자 페이지)
  3. 실시간 서버 진단 결과 (14개 항목)
  4. 문의 카테고리, 제목, 내용

---

## 2. 클로드가 문제를 인식하는 방법

### 프롬프트 역할 설정
- "웹 서비스 운영팀의 기술 분석 전문가" 역할 부여

### 컨텍스트 제공
- 문의 내용 (제목/내용/카테고리)
- 실제 서버 상태 (SSH 진단으로 수집한 실시간 데이터)
- 관리자 피드백 (재분석 시)

### 서버 진단 데이터로 실제 상태 파악
- 디스크 용량, 메모리, CPU 부하 → 리소스 문제 판단
- 웹서버/PHP 에러 로그 → 코드/설정 문제 판단
- MySQL 상태/프로세스 → DB 문제 판단
- HTTP 응답 체크 → 서비스 가용성 판단

---

## 3. 클로드가 답변을 처리하는 방법

### 분석 결과 형식 (8개 섹션)
1. 📋 문의 요약 - 유형, 핵심내용, 긴급도
2. 🔍 확인 사항 - 확인 항목별 결과
3. ⚠️ 문제점 분석 - 원인, 영향범위, 심각도
4. 💡 수정 방안 - 대상, 수정내용, 작업절차, 기대효과
5. 🔗 연관 영향 분석 - 관련 시스템 영향 여부
6. ⏱️ 예상 소요 시간 - 단계별 시간
7. 🚨 수정 불가 시 대안 - 대체 방안
8. 📌 최종 판단 - 우선순위, 권장조치

### 결과 저장 위치
1. process_logs 테이블: step='pending_approval'에 전체 분석 결과
2. comments 테이블: is_ai_answer=1로 AI 분석 결과 댓글

### 상태 전환
- registered → ai_review → pending_approval

### 관리자 후처리
- 승인 → ai_processing → completed
- 재확인 요청 → '[재확인 요청]' 피드백 → 다음 cron에서 재분석
- 재작업 → rework

### 에러 시
- status를 'registered'로 복구 → 다음 cron에서 자동 재시도
- Telegram으로 에러 알림

---

## 핵심 파일 참조
| 파일 | 역할 | 핵심 라인 |
|------|------|-----------|
| api/posts.php | 글 등록 | 133-209 |
| api/cron/ai_processor.php | AI 처리 cron | 전체 (217줄) |
| api/config.php | Claude CLI 호출 + 서버진단 | 195-399 |
| api/process.php | 워크플로우 전환 | 전체 |
