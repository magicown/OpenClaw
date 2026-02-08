# Q&A 게시판

전문적인 Q&A 게시판으로 React + shadcn UI 프론트엔드와 PHP 백엔드를 사용합니다.

## 기술 스택

- **프론트엔드**: React, TypeScript, Vite, shadcn/ui
- **백엔드**: PHP 8.4, PHP-FPM
- **데이터베이스**: MySQL 8.4
- **웹 서버**: Nginx 1.28

## 주요 기능

1. **질문/답변 게시판**
   - 게시글 작성, 수정, 삭제 (CRUD)
   - 댓글 시스템
   - 조회수 추적

2. **파일 첨부**
   - 이미지 파일 (jpg, jpeg, png, gif, webp)
   - 동영상 파일 (mp4, webm)
   - 문서 파일 (pdf, doc, docx)
   - 최대 파일 크기: 10MB

3. **AI 자동 답변**
   - 게시글 작성 시 AI 자동 답변 생성 옵션
   - 별도 API로 AI 답변 요청 가능

4. **검색 및 필터**
   - 제목/내용 검색
   - 상태별 필터 (대기 중, 답변 완료, 종료)

## 프로젝트 구조

```
/home/qna-board/
├── api/                    # PHP 백엔드 API
│   ├── config.php         # 설정 파일
│   ├── posts.php          # 게시글 API
│   ├── comments.php       # 댓글 API
│   ├── upload.php         # 파일 업로드 API
│   └── ai-answer.php      # AI 답변 API
├── frontend/              # React 프론트엔드
│   ├── src/
│   │   ├── components/    # React 컴포넌트
│   │   ├── lib/          # 유틸리티 및 API 클라이언트
│   │   └── App.tsx       # 메인 앱 컴포넌트
│   └── dist/             # 빌드된 정적 파일
├── uploads/               # 업로드된 파일 저장소
└── database.sql           # 데이터베이스 스키마
```

## API 엔드포인트

### 게시글
- `GET /api/posts.php` - 게시글 목록 조회
- `GET /api/posts.php?id={id}` - 게시글 상세 조회
- `POST /api/posts.php` - 게시글 생성
- `PUT /api/posts.php?id={id}` - 게시글 수정
- `DELETE /api/posts.php?id={id}` - 게시글 삭제

### 댓글
- `GET /api/comments.php?post_id={id}` - 댓글 목록 조회
- `POST /api/comments.php` - 댓글 생성
- `DELETE /api/comments.php?id={id}` - 댓글 삭제

### 파일 업로드
- `POST /api/upload.php` - 파일 업로드

### AI 답변
- `POST /api/ai-answer.php` - AI 답변 생성

## 데이터베이스 정보

- **데이터베이스**: qna_board
- **사용자**: qna_user
- **비밀번호**: qna_password_123

## 설정

### Nginx 설정
설정 파일: `/etc/nginx/sites-available/qna-board`

### PHP-FPM
- PHP 버전: 8.4
- 소켓: `/var/run/php/php8.4-fpm.sock`

## 개발

### 프론트엔드 개발
```bash
cd /home/qna-board/frontend
npm install
npm run dev    # 개발 서버
npm run build  # 프로덕션 빌드
```

### 백엔드 개발
PHP 파일은 `/home/qna-board/api/` 디렉토리에서 수정하면 됩니다.

## AI 연동

`/home/qna-board/api/ai-answer.php`에서 AI API 연동이 필요합니다.

현재는 더미 답변을 반환합니다. 실제 AI 서비스(OpenAI, Claude 등)와 연동하려면 해당 파일에서 API 키와 엔드포인트를 설정하세요.

예시 (OpenAI GPT-4):
```php
$apiKey = 'your-openai-api-key';
$response = curl_exec($ch);
// ... API 호출 로직
```

## 보안 참고사항

- 현재 CORS는 모든 도메인에서 허용되어 있습니다 (*)
- 프로덕션에서는 특정 도메인으로 제한하세요
- 데이터베이스 비밀번호는 환경 변수로 분리하는 것이 좋습니다

## 접속

- **웹사이트**: http://localhost 또는 http://<서버IP>
- **API**: http://localhost/api/

## 라이선스

MIT
