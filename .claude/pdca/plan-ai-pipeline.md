# PDCA Plan: Q&A 게시판 AI 처리 파이프라인 분석

## 분석 목표
게시판 글 등록 → 클로드코드 전달 → 문제 인식 → 답변 처리의 전체 흐름 파악

## 전체 파이프라인 흐름

```
[유저] 글 등록 (POST /api/posts.php)
    ↓ status = 'registered'
    ↓ 자동 댓글 생성 + Telegram 알림
    ↓
[Cron Job] 매 1분마다 실행 (api/cron/ai_processor.php)
    ↓ status='registered' 글 최대 5건 조회
    ↓ status → 'ai_review' 전환
    ↓
[서버 진단] 유저의 사이트 서버에 SSH 접속 (14개 항목)
    ↓ uptime, disk, memory, CPU, 웹서버, MySQL, 에러로그 등
    ↓
[Claude Code CLI] /usr/local/bin/claude -p '{프롬프트}' --output-format text
    ↓ 문의내용 + 서버정보 + 진단결과 → 종합 프롬프트
    ↓
[결과 저장]
    ↓ status → 'pending_approval'
    ↓ process_logs에 분석결과 저장
    ↓ comments에 AI 답변 저장 (is_ai_answer=1)
    ↓ Telegram 알림
    ↓
[관리자 검토]
    ├→ 승인 → ai_processing → completed
    ├→ 재확인 요청 → '[재확인 요청]' 피드백 → 다음 cron에서 재분석
    └→ 재작업 → rework
```

## 핵심 파일 목록
1. `api/posts.php` - 글 등록 (POST)
2. `api/cron/ai_processor.php` - AI 처리 cron (매분 실행)
3. `api/config.php` - analyzePostWithAI(), runServerDiagnostics()
4. `api/process.php` - 워크플로우 상태 전환
5. `api/ai-answer.php` - AI 답변 생성 (대체 경로)
