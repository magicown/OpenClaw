#!/usr/bin/env php
<?php
/**
 * 관리자 명령 실행기
 *
 * comments 테이블에서 is_admin_command=1 AND command_status='pending' 건을 감지하여:
 *   1. 해당 게시글의 사이트 서버 정보 조회
 *   2. Claude CLI로 명령 실행
 *   3. 실행 결과를 댓글로 자동 등록
 *   4. 텔레그램 보고
 *
 * Cron: * * * * * /usr/bin/php /home/qna-board/api/cron/ai_command_executor.php >> /home/qna-board/logs/ai_command.log 2>&1
 */

if (php_sapi_name() !== 'cli') {
    die('CLI only');
}

ob_start();
require_once __DIR__ . '/../config.php';
ob_end_clean();

function logMsg($msg) {
    echo '[' . date('Y-m-d H:i:s') . '] ' . $msg . PHP_EOL;
}

// 중복 실행 방지
$lockFile = '/tmp/ai_command_executor.lock';
if (file_exists($lockFile)) {
    $lockTime = filemtime($lockFile);
    if (time() - $lockTime > 300) { // 5분 타임아웃
        unlink($lockFile);
    } else {
        logMsg('이미 실행 중입니다.');
        exit(0);
    }
}
touch($lockFile);

register_shutdown_function(function() use ($lockFile) {
    if (file_exists($lockFile)) unlink($lockFile);
});

try {
    $db = getDB();

    // pending 명령 조회 (한 번에 1건)
    $stmt = $db->prepare("
        SELECT c.id, c.post_id, c.content, c.author_name,
               p.title as post_title, p.category, p.user_id,
               u.display_name as user_display_name, u.site as user_site
        FROM comments c
        JOIN posts p ON c.post_id = p.id
        LEFT JOIN users u ON p.user_id = u.id
        WHERE c.is_admin_command = 1 AND c.command_status = 'pending'
        ORDER BY c.created_at ASC
        LIMIT 1
    ");
    $stmt->execute();
    $cmd = $stmt->fetch();

    if (!$cmd) {
        logMsg('실행할 명령이 없습니다.');
        exit(0);
    }

    logMsg("명령 #{$cmd['id']} 실행 시작 (게시글 #{$cmd['post_id']})");

    // 명령 상태를 running으로 변경
    $db->prepare("UPDATE comments SET command_status = 'running' WHERE id = ?")
        ->execute([$cmd['id']]);

    // /cmd 접두사 제거하여 실제 명령 추출
    $commandText = preg_replace('/^\/cmd\s+/', '', $cmd['content']);

    // 서버 정보 조회
    $serverInfo = null;
    if (!empty($cmd['user_site'])) {
        $serverStmt = $db->prepare("SELECT * FROM servers WHERE site_name = ?");
        $serverStmt->execute([$cmd['user_site']]);
        $serverInfo = $serverStmt->fetch();
        if ($serverInfo) {
            foreach (['ssh_password', 'db_password', 'site_login_pw', 'admin_login_pw'] as $pwField) {
                if (!empty($serverInfo[$pwField])) {
                    $serverInfo[$pwField] = decryptValue($serverInfo[$pwField]);
                }
            }
        }
    }

    // 텔레그램: 명령 실행 시작 알림
    $siteName = $cmd['user_site'] ?? '알 수 없음';
    sendTelegramNotification(
        "⚡ 관리자 명령 실행 시작\n" .
        "게시글 #{$cmd['post_id']}: {$cmd['post_title']}\n" .
        "🏢 사이트: {$siteName}\n" .
        "💬 명령: " . mb_substr($commandText, 0, 200) . "\n" .
        "👤 요청: {$cmd['author_name']}"
    );

    if (!$serverInfo) {
        // 서버 정보 없으면 실패 처리
        $resultOutput = "⚠️ 서버 접속 정보를 찾을 수 없습니다. (사이트: {$siteName})\n관리자 페이지 > 서버 관리에서 서버 정보를 등록해주세요.";
        $success = false;
    } else {
        // Claude CLI로 명령 실행
        logMsg("명령 실행 중: {$commandText}");
        $result = executeAdminCommand($commandText, $serverInfo, $cmd['post_id']);
        $resultOutput = $result['output'];
        $success = $result['success'];
    }

    // 실행 결과를 댓글로 등록
    $statusEmoji = $success ? '✅' : '❌';
    $resultComment = "{$statusEmoji} 명령 실행 결과\n\n{$resultOutput}";

    $db->prepare("
        INSERT INTO comments (post_id, content, author_name, is_ai_answer)
        VALUES (?, ?, ?, 1)
    ")->execute([$cmd['post_id'], $resultComment, 'AI 실행기']);

    $resultCommentId = $db->lastInsertId();

    // 원본 명령 댓글 상태 업데이트
    $db->prepare("UPDATE comments SET command_status = ?, command_result_id = ? WHERE id = ?")
        ->execute([$success ? 'completed' : 'failed', $resultCommentId, $cmd['id']]);

    // 텔레그램: 결과 보고
    $resultSummary = mb_substr($resultOutput, 0, 500);
    sendTelegramNotification(
        "{$statusEmoji} 관리자 명령 실행 " . ($success ? '완료' : '실패') . "\n" .
        "게시글 #{$cmd['post_id']}: {$cmd['post_title']}\n" .
        "🏢 사이트: {$siteName}\n\n" .
        "📋 결과:\n{$resultSummary}"
    );

    logMsg("명령 #{$cmd['id']} 실행 " . ($success ? '완료' : '실패'));

} catch (Exception $e) {
    logMsg('치명적 오류: ' . $e->getMessage());
    exit(1);
}
