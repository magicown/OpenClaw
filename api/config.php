<?php
// 데이터베이스 설정
define('DB_HOST', '127.0.0.1');
define('DB_NAME', 'qna_board');
define('DB_USER', 'qna_user');
define('DB_PASS', 'qna_password_123');

// 암호화 키 (서버 비밀번호 암호화용)
define('ENCRYPT_KEY', 'qna_s3rv3r_3ncrypt_k3y_2026!@#');

// AES-256-CBC 암호화
function encryptValue($value) {
    if (empty($value)) return '';
    $cipher = 'aes-256-cbc';
    $iv = openssl_random_pseudo_bytes(openssl_cipher_iv_length($cipher));
    $encrypted = openssl_encrypt($value, $cipher, ENCRYPT_KEY, 0, $iv);
    return base64_encode($iv . '::' . $encrypted);
}

// AES-256-CBC 복호화
function decryptValue($encrypted) {
    if (empty($encrypted)) return '';
    $data = base64_decode($encrypted);
    $parts = explode('::', $data, 2);
    if (count($parts) !== 2) return $encrypted; // 암호화되지 않은 평문인 경우 그대로 반환
    $iv = $parts[0];
    $encrypted = $parts[1];
    $decrypted = openssl_decrypt($encrypted, 'aes-256-cbc', ENCRYPT_KEY, 0, $iv);
    return $decrypted !== false ? $decrypted : '';
}

// 파일 업로드 경로
define('UPLOAD_DIR', '/home/qna-board/uploads/');
define('MAX_FILE_SIZE', 10 * 1024 * 1024); // 10MB

// 허용된 파일 확장자
define('ALLOWED_EXTENSIONS', ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'pdf', 'doc', 'docx']);

// CORS 설정 (CLI 제외)
if (php_sapi_name() !== 'cli') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');

    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(200);
        exit;
    }
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
define('TELEGRAM_BOT_TOKEN', '8306275407:AAHH-Dg-wSAN_-hCvqByNQWixmqXx1pDNYQ');
define('TELEGRAM_CHAT_ID', '6105247935');

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

// Claude Code CLI 경로
define('CLAUDE_CLI_PATH', '/usr/local/bin/claude');

// 대상 서버에 SSH 접속하여 진단 데이터 수집
function runServerDiagnostics($serverInfo) {
    if (empty($serverInfo) || empty($serverInfo['server_ip']) || empty($serverInfo['ssh_password'])) {
        return null;
    }

    $ip = $serverInfo['server_ip'];
    $user = $serverInfo['ssh_user'] ?: 'root';
    $password = $serverInfo['ssh_password'];
    $siteUrl = $serverInfo['site_url'] ?: '';

    // SSH 옵션: 호스트키 검증 생략, 타임아웃 10초
    $sshOpts = '-o StrictHostKeyChecking=no -o ConnectTimeout=10 -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR';
    $sshBase = "sshpass -p " . escapeshellarg($password) . " ssh {$sshOpts} " . escapeshellarg("{$user}@{$ip}");

    $diagnostics = [];

    // 1. 서버 기본 상태
    $commands = [
        'uptime' => 'uptime',
        'disk' => 'df -h / 2>&1 | tail -1',
        'memory' => 'free -h 2>&1 | grep -E "Mem|total"',
        'cpu_load' => 'cat /proc/loadavg 2>&1',
        'web_server' => 'systemctl is-active nginx 2>/dev/null || systemctl is-active apache2 2>/dev/null || systemctl is-active httpd 2>/dev/null || echo "unknown"',
        'mysql_status' => 'systemctl is-active mysql 2>/dev/null || systemctl is-active mariadb 2>/dev/null || systemctl is-active mysqld 2>/dev/null || echo "unknown"',
        'web_error_log' => 'tail -20 /var/log/nginx/error.log 2>/dev/null || tail -20 /var/log/apache2/error.log 2>/dev/null || tail -20 /var/log/httpd/error_log 2>/dev/null || echo "로그 없음"',
        'php_error_log' => 'tail -20 /var/log/php*error*.log 2>/dev/null || tail -20 /var/log/php-fpm/*.log 2>/dev/null || echo "로그 없음"',
        'php_fpm_status' => 'systemctl is-active php*-fpm 2>/dev/null || echo "unknown"',
        'listening_ports' => 'ss -tlnp 2>/dev/null | grep -E ":80|:443|:3306|:8080" || netstat -tlnp 2>/dev/null | grep -E ":80|:443|:3306|:8080" || echo "확인 불가"',
        'recent_cron' => 'tail -10 /var/log/syslog 2>/dev/null | grep -i cron || tail -10 /var/log/cron 2>/dev/null || echo "없음"',
    ];

    // 사이트 URL이 있으면 HTTP 응답 확인
    if ($siteUrl) {
        $commands['site_http_check'] = "curl -sI -o /dev/null -w '%{http_code} %{time_total}s' --max-time 10 'https://{$siteUrl}' 2>&1 || curl -sI -o /dev/null -w '%{http_code} %{time_total}s' --max-time 10 'http://{$siteUrl}' 2>&1";
    }

    // DB 접속 확인
    if (!empty($serverInfo['db_password'])) {
        $dbUser = $serverInfo['db_user'] ?: 'root';
        $dbPass = $serverInfo['db_password'];
        $commands['db_check'] = "mysql -u" . escapeshellarg($dbUser) . " -p" . escapeshellarg($dbPass) . " -e 'SHOW DATABASES;' 2>&1 | head -20";
        $commands['db_process'] = "mysql -u" . escapeshellarg($dbUser) . " -p" . escapeshellarg($dbPass) . " -e 'SHOW PROCESSLIST;' 2>&1 | head -20";
    }

    foreach ($commands as $key => $cmd) {
        $fullCmd = "{$sshBase} " . escapeshellarg($cmd) . " 2>&1";
        $output = [];
        $returnCode = null;
        exec($fullCmd, $output, $returnCode);
        $diagnostics[$key] = implode("\n", $output);
    }

    return $diagnostics;
}

// AI 문의 분석 (Claude Code CLI 사용)
function analyzePostWithAI($title, $content, $category, $adminFeedback = null, $serverInfo = null, $diagnostics = null) {
    $feedbackSection = '';
    if ($adminFeedback) {
        $feedbackSection = <<<FEEDBACK

🔄 [관리자 재확인 요청]
이전 분석에 대해 관리자가 아래와 같은 피드백을 보냈습니다.
반드시 이 피드백 내용을 반영하여 재분석해주세요.
기존 분석에서 부족했던 부분을 보완하고, 관리자가 지적한 사항을 중점적으로 다시 확인해주세요.

관리자 피드백: {$adminFeedback}

FEEDBACK;
    }

    $serverSection = '';
    if ($serverInfo) {
        $serverSection = "\n🖥️ [대상 서버 정보]\n";
        $serverSection .= "이 문의는 아래 서버에서 발생한 문제입니다.\n\n";
        $serverSection .= "- 사이트명: {$serverInfo['display_name']}\n";
        $serverSection .= "- 서버 IP: {$serverInfo['server_ip']}\n";
        $serverSection .= "- 사이트 주소: {$serverInfo['site_url']}\n";
        $serverSection .= "- 관리자 페이지: {$serverInfo['admin_url']}\n";

        if ($diagnostics) {
            $serverSection .= "\n📡 [실제 서버 진단 결과]\n";
            $serverSection .= "아래는 해당 서버에 직접 접속하여 수집한 실시간 진단 데이터입니다.\n";
            $serverSection .= "이 데이터를 기반으로 정확한 문제 원인을 분석해주세요.\n\n";

            $labels = [
                'uptime' => '서버 가동시간',
                'disk' => '디스크 사용량',
                'memory' => '메모리 상태',
                'cpu_load' => 'CPU 부하',
                'web_server' => '웹서버 상태',
                'mysql_status' => 'MySQL/MariaDB 상태',
                'php_fpm_status' => 'PHP-FPM 상태',
                'listening_ports' => '리슨 포트',
                'site_http_check' => '사이트 HTTP 응답',
                'db_check' => 'DB 접속 확인',
                'db_process' => 'DB 프로세스',
                'web_error_log' => '웹서버 에러 로그 (최근)',
                'php_error_log' => 'PHP 에러 로그 (최근)',
                'recent_cron' => '최근 크론 로그',
            ];

            foreach ($diagnostics as $key => $value) {
                $label = $labels[$key] ?? $key;
                $serverSection .= "--- {$label} ---\n{$value}\n\n";
            }
        }

        $serverSection .= "\n";
    }

    $prompt = <<<PROMPT
당신은 웹 서비스 운영팀의 기술 분석 전문가입니다.
고객 문의를 분석하여 관리자가 승인할 수 있는 상세한 처리 보고서를 작성해주세요.

절대 마크다운 문법(#, **, |, ---, >, ```)을 사용하지 마세요.
이모지와 일반 텍스트, 번호 목록만 사용하세요.
{$feedbackSection}{$serverSection}
[카테고리]: {$category}
[제목]: {$title}
[내용]: {$content}

아래 형식을 정확히 따라주세요:

📋 문의 요약
- 문의 유형: (오류/건의/긴급/추가개발/기타)
- 핵심 내용: (1-2줄 요약)
- 접수 긴급도: (긴급/높음/보통/낮음)

🔍 확인 사항
(어떤 부분을 확인했는지 구체적으로 기술)
1. 확인 항목: (확인한 내용)
   확인 결과: (정상/이상/확인필요)
   상세: (확인한 내용의 세부사항)
2. 확인 항목: (확인한 내용)
   확인 결과: (정상/이상/확인필요)
   상세: (확인한 내용의 세부사항)

⚠️ 문제점 분석
(각 문제점이 어떻게 잘못되었는지 원인까지 기술)
1. 문제: (문제 설명)
   원인: (왜 이 문제가 발생했는지)
   영향 범위: (이 문제로 인해 어디까지 영향을 받는지)
   심각도: (치명적/높음/보통/낮음)
2. 문제: (문제 설명)
   원인: (원인 설명)
   영향 범위: (영향 범위)
   심각도: (심각도)

💡 수정 방안
(각 문제에 대해 어떤 부분을 어떻게 수정하면 되는지 구체적으로)
1. 대상: (수정할 대상 - 서버/DB/코드/설정 등)
   수정 내용: (구체적으로 무엇을 어떻게 변경하는지)
   작업 절차: (순서대로 작업 단계를 나열)
   기대 효과: (수정 후 예상되는 결과)
2. 대상: (수정할 대상)
   수정 내용: (구체적 변경 내용)
   작업 절차: (작업 단계)
   기대 효과: (예상 결과)

🔗 연관 영향 분석
(수정했을 때 다른 관련된 부분에 영향이 없는지 확인)
1. 관련 시스템/기능: (영향받을 수 있는 부분)
   영향 여부: (영향있음/영향없음)
   대응 방안: (영향이 있다면 어떻게 대응하는지)

⏱️ 예상 소요 시간
- 분석 완료: 완료
- 수정 작업: (예상 시간)
- 테스트 검증: (예상 시간)
- 전체 소요: (총 예상 시간)

🚨 수정 불가 시 대안
(만약 수정이 안되거나 문제가 심각한 경우 어떤 조치를 할 수 있는지)
1. 대안: (대체 방안 설명)
   조건: (이 대안을 선택하는 조건)
   장단점: (장점과 단점)
2. 대안: (대체 방안 설명)
   조건: (조건)
   장단점: (장점과 단점)
- 긴급 연락: (에스컬레이션이 필요한 경우 누구에게 연락해야 하는지)

📌 최종 판단
- 우선순위: (긴급/높음/보통/낮음)
- 권장 조치: (즉시처리/일반처리/모니터링/보류)
- 승인 요청 사항: (관리자에게 승인받아야 할 구체적 내용을 한줄로)
PROMPT;

    $escapedPrompt = escapeshellarg($prompt);

    // Claude Code CLI를 비대화형 모드로 실행
    $command = CLAUDE_CLI_PATH . ' -p ' . $escapedPrompt . ' --output-format text 2>&1';

    $output = null;
    $returnCode = null;
    exec($command, $outputLines, $returnCode);
    $output = implode("\n", $outputLines);

    if ($returnCode !== 0 || empty(trim($output))) {
        throw new Exception('Claude Code 실행 실패 (code: ' . $returnCode . '): ' . substr($output, 0, 500));
    }

    return trim($output);
}

// AI 답변 생성 (Claude Code CLI)
function generateAIAnswer($question) {
    $prompt = "당신은 Q&A 게시판의 친절한 AI 어시스턴트입니다. 사용자의 질문에 한국어로 명확하고 도움이 되는 답변을 해주세요.\n\n질문: {$question}";
    $escapedPrompt = escapeshellarg($prompt);

    $command = CLAUDE_CLI_PATH . ' -p ' . $escapedPrompt . ' --output-format text 2>&1';

    $outputLines = [];
    $returnCode = null;
    exec($command, $outputLines, $returnCode);
    $output = implode("\n", $outputLines);

    if ($returnCode !== 0 || empty(trim($output))) {
        throw new Exception('Claude Code 실행 실패 (code: ' . $returnCode . '): ' . substr($output, 0, 500));
    }

    return trim($output);
}
