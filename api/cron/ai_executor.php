#!/usr/bin/env php
<?php
/**
 * AI 서버 수정 실행기
 *
 * status='ai_execution'인 게시글을 감지하여:
 *   1. PDCA 수정 계획을 조회
 *   2. Claude Code CLI로 서버 접속 + 수정 실행
 *   3. 실행 결과를 execution_logs에 기록
 *   4. admin_confirm으로 전환 + 텔레그램 보고
 *
 * Cron: * * * * * /usr/bin/php /home/qna-board/api/cron/ai_executor.php >> /home/qna-board/logs/ai_executor.log 2>&1
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
$lockFile = '/tmp/ai_executor.lock';
if (file_exists($lockFile)) {
    $lockTime = filemtime($lockFile);
    if (time() - $lockTime > 600) { // 10분 타임아웃 (실행 시간이 더 길 수 있음)
        unlink($lockFile);
    } else {
        logMsg('이미 실행 중입니다. 건너뜁니다.');
        exit(0);
    }
}
touch($lockFile);

register_shutdown_function(function() use ($lockFile) {
    if (file_exists($lockFile)) {
        unlink($lockFile);
    }
});

try {
    $db = getDB();

    // ai_execution 상태 게시글 조회 (한 번에 1건만)
    $stmt = $db->prepare("
        SELECT p.id, p.title, p.content, p.category, p.user_id,
               u.display_name as user_display_name, u.site as user_site
        FROM posts p
        LEFT JOIN users u ON p.user_id = u.id
        WHERE p.status = 'ai_execution'
        ORDER BY p.created_at ASC
        LIMIT 1
    ");
    $stmt->execute();
    $post = $stmt->fetch();

    if (!$post) {
        logMsg('실행할 게시글이 없습니다.');
        exit(0);
    }

    logMsg("게시글 #{$post['id']} 서버 수정 실행 시작: {$post['title']}");

    try {
        // PDCA 분석 결과 조회
        $pdcaStmt = $db->prepare("
            SELECT id, pdca_plan FROM ai_analysis_results
            WHERE post_id = ? AND phase = 'pdca' AND status = 'completed'
            ORDER BY created_at DESC LIMIT 1
        ");
        $pdcaStmt->execute([$post['id']]);
        $pdcaResult = $pdcaStmt->fetch();

        if (!$pdcaResult) {
            throw new Exception('PDCA 분석 결과를 찾을 수 없습니다.');
        }

        $pdcaPlan = $pdcaResult['pdca_plan'];
        $analysisId = $pdcaResult['id'];

        // 서버 정보 조회
        $serverInfo = null;
        if (!empty($post['user_site'])) {
            $serverStmt = $db->prepare("SELECT * FROM servers WHERE site_name = ?");
            $serverStmt->execute([$post['user_site']]);
            $serverInfo = $serverStmt->fetch();
            if ($serverInfo) {
                foreach (['ssh_password', 'db_password', 'site_login_pw', 'admin_login_pw'] as $pwField) {
                    if (!empty($serverInfo[$pwField])) {
                        $serverInfo[$pwField] = decryptValue($serverInfo[$pwField]);
                    }
                }
            }
        }

        if (!$serverInfo) {
            throw new Exception('서버 접속 정보가 없습니다.');
        }

        // 프로세스 로그: 실행 시작
        $db->prepare("INSERT INTO process_logs (post_id, step, content) VALUES (?, 'ai_execution', '서버 수정 작업을 실행하고 있습니다.')")
            ->execute([$post['id']]);

        // Claude Code CLI로 서버 수정 실행
        logMsg("게시글 #{$post['id']}: 서버 수정 실행 중 ({$serverInfo['server_ip']})...");
        $executionResult = executeFixWithClaude($pdcaPlan, $serverInfo, $post['id'], $post['title']);
        logMsg("게시글 #{$post['id']}: 서버 수정 실행 완료");

        // 실행 결과 저장
        $db->beginTransaction();

        // ai_analysis_results에 실행 결과 저장
        $db->prepare("INSERT INTO ai_analysis_results (post_id, phase, iteration, execution_result, raw_claude_output, status) VALUES (?, 'execution', 1, ?, ?, 'completed')")
            ->execute([$post['id'], $executionResult, $executionResult]);

        // execution_logs에 기록
        $db->prepare("INSERT INTO execution_logs (post_id, analysis_id, server_id, command, output, exit_code) VALUES (?, ?, ?, ?, ?, ?)")
            ->execute([
                $post['id'],
                $analysisId,
                $serverInfo['id'] ?? null,
                'Claude Code CLI 자동 실행',
                $executionResult,
                0
            ]);

        // admin_confirm으로 전환
        $db->prepare("UPDATE posts SET status = 'admin_confirm' WHERE id = ?")->execute([$post['id']]);

        $db->prepare("INSERT INTO process_logs (post_id, step, content) VALUES (?, 'admin_confirm', ?)")
            ->execute([$post['id'], "서버 수정이 완료되었습니다. 관리자 최종 확인이 필요합니다.\n\n" . $executionResult]);

        $db->commit();

        // 텔레그램 실행 결과 보고
        $siteName = $post['user_site'] ?? '알 수 없음';
        $resultSummary = mb_substr($executionResult, 0, 500);

        $telegramMsg = "🔧 서버 수정 완료 — 관리자 확인 필요\n\n";
        $telegramMsg .= "📌 게시글 #{$post['id']}\n";
        $telegramMsg .= "📝 제목: {$post['title']}\n";
        $telegramMsg .= "🏢 사이트: {$siteName}\n\n";
        $telegramMsg .= "📋 실행 결과:\n{$resultSummary}\n\n";
        $telegramMsg .= "관리자 페이지에서 최종 확인 후 완료 처리해주세요.";
        sendTelegramNotification($telegramMsg);

        logMsg("게시글 #{$post['id']}: admin_confirm 전환 + 텔레그램 보고 완료");

    } catch (Exception $e) {
        if ($db->inTransaction()) $db->rollBack();
        logMsg("게시글 #{$post['id']} 실행 실패: " . $e->getMessage());

        // 실행 실패 시 rework으로 전환 (관리자 재검토)
        try {
            $db->prepare("UPDATE posts SET status = 'admin_confirm' WHERE id = ? AND status = 'ai_execution'")->execute([$post['id']]);
            $db->prepare("INSERT INTO process_logs (post_id, step, content) VALUES (?, 'admin_confirm', ?)")
                ->execute([$post['id'], "서버 수정 실행 중 오류가 발생했습니다.\n오류: " . $e->getMessage() . "\n\n관리자 확인이 필요합니다."]);
            logMsg("게시글 #{$post['id']}: admin_confirm으로 전환 (실행 오류)");
        } catch (Exception $ex) {
            logMsg("게시글 #{$post['id']}: 상태 복구 실패 - " . $ex->getMessage());
        }

        // 실행 실패 로그
        try {
            $db->prepare("INSERT INTO execution_logs (post_id, command, output, exit_code) VALUES (?, ?, ?, ?)")
                ->execute([$post['id'], 'Claude Code CLI 자동 실행', '오류: ' . $e->getMessage(), 1]);
        } catch (Exception $logEx) {}

        $errorMsg = "⚠️ 서버 수정 실행 오류\n게시글 #{$post['id']}: {$post['title']}\n오류: " . $e->getMessage();
        sendTelegramNotification($errorMsg);
    }

    logMsg('AI 실행기 완료');

} catch (Exception $e) {
    logMsg('치명적 오류: ' . $e->getMessage());
    exit(1);
}
