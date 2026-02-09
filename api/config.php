<?php
// 데이터베이스 설정
define('DB_HOST', '127.0.0.1');
define('DB_NAME', 'qna_board');
define('DB_USER', 'qna_user');
define('DB_PASS', 'qna_password_123');

// 파일 업로드 경로
define('UPLOAD_DIR', '/home/qna-board/uploads/');
define('MAX_FILE_SIZE', 10 * 1024 * 1024); // 10MB

// 허용된 파일 확장자
define('ALLOWED_EXTENSIONS', ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'pdf', 'doc', 'docx']);

// CORS 설정
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// JSON 응답 헬퍼
function jsonResponse($data, $status = 200) {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

// 데이터베이스 연결
function getDB() {
    static $pdo = null;

    if ($pdo === null) {
        try {
            $pdo = new PDO(
                "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4",
                DB_USER,
                DB_PASS,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false
                ]
            );
        } catch (PDOException $e) {
            jsonResponse(['error' => 'Database connection failed: ' . $e->getMessage()], 500);
        }
    }

    return $pdo;
}

// 파일 업로드 처리
function uploadFile($file) {
    if ($file['error'] !== UPLOAD_ERR_OK) {
        throw new Exception('File upload error: ' . $file['error']);
    }

    if ($file['size'] > MAX_FILE_SIZE) {
        throw new Exception('File size exceeds maximum limit');
    }

    $fileExtension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($fileExtension, ALLOWED_EXTENSIONS)) {
        throw new Exception('Invalid file type');
    }

    // 파일명 생성 (타임스탬프 + 랜덤)
    $fileName = uniqid() . '_' . time() . '.' . $fileExtension;
    $filePath = UPLOAD_DIR . $fileName;

    if (!move_uploaded_file($file['tmp_name'], $filePath)) {
        throw new Exception('Failed to save file');
    }

    // 파일 타입 결정
    $mimeTypes = ['image' => ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
                  'video' => ['video/mp4', 'video/webm'],
                  'document' => ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']];

    $fileMime = mime_content_type($filePath);
    $fileType = 'document';
    foreach ($mimeTypes as $type => $mimes) {
        if (in_array($fileMime, $mimes)) {
            $fileType = $type;
            break;
        }
    }

    return [
        'file_name' => $file['name'],
        'file_path' => $filePath,
        'file_size' => $file['size'],
        'mime_type' => $fileMime,
        'file_type' => $fileType
    ];
}

// 텔레그램 봇 설정
define('TELEGRAM_BOT_TOKEN', ''); // 텔레그램 봇 토큰 설정 필요
define('TELEGRAM_CHAT_ID', '');   // 알림 받을 채팅 ID 설정 필요

// 텔레그램 알림 전송
function sendTelegramNotification($message) {
    if (empty(TELEGRAM_BOT_TOKEN) || empty(TELEGRAM_CHAT_ID)) {
        return false;
    }

    $url = 'https://api.telegram.org/bot' . TELEGRAM_BOT_TOKEN . '/sendMessage';
    $payload = json_encode([
        'chat_id' => TELEGRAM_CHAT_ID,
        'text' => $message,
        'parse_mode' => 'HTML',
    ]);

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);

    $response = curl_exec($ch);
    curl_close($ch);

    return $response !== false;
}

// 랜덤 관리자 이름 반환
function getRandomAdminName() {
    $names = ['에단', '미러', '마이클', '샘슨', '조나단', '엘리사', '미첼', '에비게일', '나탸샤', '촬리', '버클리', '엣지'];
    return $names[array_rand($names)];
}

// 세션 기반 인증 체크
function requireAuth() {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    if (!isset($_SESSION['user_id'])) {
        jsonResponse(['error' => '로그인이 필요합니다.'], 401);
    }
    return [
        'id' => $_SESSION['user_id'],
        'username' => $_SESSION['username'],
        'display_name' => $_SESSION['display_name'],
        'role' => $_SESSION['role'] ?? 'user',
        'site' => $_SESSION['site'] ?? null,
    ];
}

// 관리자 권한 체크
function requireAdmin() {
    $user = requireAuth();
    if ($user['role'] !== 'admin') {
        jsonResponse(['error' => '관리자 권한이 필요합니다.'], 403);
    }
    return $user;
}

// Gemini AI 설정
define('GEMINI_API_KEY', 'AIzaSyCtNxMa6WGwtko9f5TEk5fYXLzN8vac0vg');
define('GEMINI_MODEL', 'gemini-2.0-flash');

// AI 답변 생성 (Google Gemini)
function generateAIAnswer($question) {
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . GEMINI_MODEL . ':generateContent?key=' . GEMINI_API_KEY;

    $payload = json_encode([
        'contents' => [
            [
                'parts' => [
                    ['text' => "당신은 Q&A 게시판의 친절한 AI 어시스턴트입니다. 사용자의 질문에 한국어로 명확하고 도움이 되는 답변을 해주세요.\n\n질문: {$question}"]
                ]
            ]
        ],
        'generationConfig' => [
            'temperature' => 0.7,
            'maxOutputTokens' => 2048,
        ]
    ]);

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($curlError) {
        throw new Exception('Gemini API 요청 실패: ' . $curlError);
    }

    $result = json_decode($response, true);

    if ($httpCode !== 200 || !$result) {
        $errorMsg = $result['error']['message'] ?? 'Unknown error';
        throw new Exception('Gemini API 오류: ' . $errorMsg);
    }

    $answer = $result['candidates'][0]['content']['parts'][0]['text'] ?? null;

    if (!$answer) {
        throw new Exception('Gemini API에서 유효한 답변을 받지 못했습니다.');
    }

    return $answer;
}
