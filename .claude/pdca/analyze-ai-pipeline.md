# PDCA Analyze: Q&A 게시판 AI 처리 파이프라인

## Match Rate: 100%

이 작업은 코드 조사/분석 태스크이므로, 코드와 문서의 일치도를 기준으로 평가합니다.

### 검증 결과

| 흐름 단계 | 파일 | 코드 확인 | 일치 |
|-----------|------|-----------|------|
| 글 등록 | api/posts.php:133-209 | status='registered', 자동댓글, Telegram 알림 확인 | O |
| Cron 감지 | api/cron/ai_processor.php:54-65 | 매분 실행, registered 글 5건 조회 확인 | O |
| 중복 방지 | ai_processor.php:30-49 | lock file + 5분 timeout 확인 | O |
| 서버 진단 | ai_processor.php:111-138 + config.php:195-249 | SSH 14개 항목 진단 확인 | O |
| Claude CLI 호출 | config.php:386-392 | `/usr/local/bin/claude -p {prompt} --output-format text` 확인 | O |
| 프롬프트 구성 | config.php:307-382 | 피드백+서버정보+진단+문의내용+형식지정 확인 | O |
| 결과 저장 | ai_processor.php:145-169 | process_logs + comments (is_ai_answer=1) 확인 | O |
| 상태 전환 | ai_processor.php:81,149 | registered→ai_review→pending_approval 확인 | O |
| 에러 복구 | ai_processor.php:183-205 | registered로 복원 + Telegram 에러 알림 확인 | O |
| 재분석 | ai_processor.php:97-109 | '[재확인 요청]' 피드백 감지 → 재분석 확인 | O |
