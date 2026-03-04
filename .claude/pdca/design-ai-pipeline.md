# PDCA Design: Q&A 게시판 AI 처리 파이프라인 상세 설계

## 1단계: 글 등록 (api/posts.php POST)

### 트리거
- 유저가 제목, 내용, 카테고리를 입력하여 게시글 작성

### 처리
1. posts 테이블에 INSERT (status='registered')
2. 랜덤 관리자명으로 자동 댓글 생성 ("해당 문제를 확인하고 있습니다...")
3. process_logs에 'registered' 단계 기록
4. Telegram으로 관리자에게 새 문의 알림

---

## 2단계: Cron Job이 글 감지 (api/cron/ai_processor.php)

### 실행 주기
- `* * * * *` (매 1분)
- /usr/bin/php /home/qna-board/api/cron/ai_processor.php

### 중복 방지
- 락 파일: /tmp/ai_processor.lock
- 5분 이상 된 락 파일은 자동 제거 (stale lock)

### 배치 처리
- status='registered' 글을 created_at ASC 순서로 최대 5건 조회
- 각 글 처리 간 2초 딜레이 (API rate limit 방지)

---

## 3단계: 서버 진단 수집 (config.php - runServerDiagnostics)

### 조건
- 유저에게 user_site가 지정되어 있고, servers 테이블에 해당 서버 정보가 있을 때

### SSH 진단 14개 항목
1. uptime - 서버 가동 시간
2. disk - 디스크 사용량
3. memory - 메모리 상태
4. cpu_load - CPU 부하
5. web_server - Nginx/Apache 상태
6. mysql_status - MySQL 상태
7. web_error_log - 웹서버 에러로그 (최근 20줄)
8. php_error_log - PHP 에러로그 (최근 20줄)
9. php_fpm_status - PHP-FPM 상태
10. listening_ports - 리스닝 포트 목록
11. recent_cron - 최근 cron 로그
12. site_http_check - HTTP 응답 체크
13. db_check - DB 연결 확인
14. db_process - DB 프로세스 리스트

### 접속 방법
- sshpass + ssh로 서버에 접속 (servers 테이블의 암호 복호화)

---

## 4단계: Claude Code CLI 호출 (config.php - analyzePostWithAI)

### 호출 명령
```
/usr/local/bin/claude -p '{프롬프트}' --output-format text 2>&1
```

### 프롬프트 구성
1. 관리자 피드백 (재분석 시)
2. 서버 정보 (IP, URL, 관리자 페이지)
3. 서버 진단 결과 (14개 항목)
4. 문의 내용 (제목, 내용, 카테고리)
5. 출력 형식 지정 (마크다운 금지, 이모지+텍스트만)

### 응답 형식
- 문의 요약, 확인 사항, 문제점 분석, 수정 방안
- 연관 영향 분석, 예상 소요 시간, 대안, 최종 판단

---

## 5단계: 결과 저장 및 상태 전환

### 저장 위치
1. process_logs: step='pending_approval', content=분석결과
2. comments: is_ai_answer=1, author_name=랜덤관리자명

### 상태 전환
- posts.status: 'ai_review' → 'pending_approval'

---

## 6단계: 관리자 검토 (api/process.php)

### 가능한 액션
- 승인 → 'ai_processing' → 'completed'
- 재확인 요청 → '[재확인 요청]' 접두사 피드백 → 재분석
- 재작업 → 'rework' → 'ai_processing'
- 관리자 컨펌 → 'admin_confirm'

### 재분석 트리거
- 관리자가 '[재확인 요청]' 접두사로 피드백 작성
- 다음 cron 실행 시 피드백 감지 → 피드백 포함하여 재분석

---

## 에러 처리
- AI 실행 실패 시: status를 'registered'로 복원 → 다음 cron에서 재시도
- 트랜잭션 롤백 + Telegram 에러 알림
