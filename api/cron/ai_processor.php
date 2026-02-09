#!/usr/bin/env php
<?php
/**
 * AI 자동 처리 파이프라인
 *
 * 새로운 문의글(registered)을 자동으로 분석하여 관리자 승인 요청까지 진행
 * 처리 흐름: registered → ai_review(분석중) → pending_approval(승인대기)
 *
 * Cron: * * * * * /usr/bin/php /home/qna-board/api/cron/ai_processor.php >> /home/qna-board/logs/ai_processor.log 2>&1
 */

// CLI 전용 실행
if (php_sapi_name() !== 'cli') {
    die('CLI only');
}

// config.php의 header() 호출 방지
ob_start();

// config.php 경로 (서버 절대경로)
require_once __DIR__ . '/../config.php';

ob_end_clean();

// 로그 함수
function logMsg($msg) {
    echo '[' . date('Y-m-d H:i:s') . '] ' . $msg . PHP_EOL;
}

// 중복 실행 방지 (lock file)
$lockFile = '/tmp/ai_processor.lock';
if (file_exists($lockFile)) {
    $lockTime = filemtime($lockFile);
    // 5분 이상 된 lock은 제거 (비정상 종료 대비)
    if (time() - $lockTime > 300) {
        unlink($lockFile);
    } else {
        logMsg('이미 실행 중입니다. 건너뜁니다.');
        exit(0);
    }
}
touch($lockFile);

// 종료 시 lock 제거
register_shutdown_function(function() use ($lockFile) {
    if (file_exists($lockFile)) {
        unlink($lockFile);
    }
});

try {
    $db = getDB();

    // 1. registered 상태의 게시글 조회 (오래된 순)
    $stmt = $db->prepare("
        SELECT p.id, p.title, p.content, p.category, p.user_id,
               u.display_name as user_display_name, u.site as user_site
        FROM posts p
        LEFT JOIN users u ON p.user_id = u.id
        WHERE p.status = 'registered'
        ORDER BY p.created_at ASC
        LIMIT 5
    ");
    $stmt->execute();
    $posts = $stmt->fetchAll();

    if (empty($posts)) {
        logMsg('처리할 문의글이 없습니다.');
        exit(0);
    }

    logMsg(count($posts) . '건의 문의글을 처리합니다.');

    foreach ($posts as $post) {
        logMsg("게시글 #{$post['id']} 처리 시작: {$post['title']}");

        try {
            $db->beginTransaction();

            // 2. 상태를 ai_review로 변경 (분석 중)
            $stmt = $db->prepare("UPDATE posts SET status = 'ai_review' WHERE id = ? AND status = 'registered'");
            $stmt->execute([$post['id']]);

            if ($stmt->rowCount() === 0) {
                $db->rollBack();
                logMsg("게시글 #{$post['id']}: 이미 처리 중이거나 상태가 변경되었습니다.");
                continue;
            }

            // 프로세스 로그: AI 분석 시작
            $stmt = $db->prepare("INSERT INTO process_logs (post_id, step, content) VALUES (?, 'ai_review', 'AI가 문의 내용을 분석하고 있습니다.')");
            $stmt->execute([$post['id']]);

            $db->commit();
            logMsg("게시글 #{$post['id']}: ai_review 상태로 전환 완료");

            // 3. 관리자 피드백 확인 (재확인 요청이 있었는지)
            $feedbackStmt = $db->prepare("
                SELECT content FROM process_logs
                WHERE post_id = ? AND content LIKE '[재확인 요청]%'
                ORDER BY created_at DESC LIMIT 1
            ");
            $feedbackStmt->execute([$post['id']]);
            $feedbackRow = $feedbackStmt->fetch();
            $adminFeedback = $feedbackRow ? $feedbackRow['content'] : null;

            if ($adminFeedback) {
                logMsg("게시글 #{$post['id']}: 관리자 피드백 발견 - 재분석 진행");
            }

            // 3-1. 사용자 사이트 기반 서버 정보 조회 (비밀번호 복호화)
            $serverInfo = null;
            if (!empty($post['user_site'])) {
                $serverStmt = $db->prepare("SELECT * FROM servers WHERE site_name = ?");
                $serverStmt->execute([$post['user_site']]);
                $serverInfo = $serverStmt->fetch();
                if ($serverInfo) {
                    // 암호화된 비밀번호 복호화
                    foreach (['ssh_password', 'db_password', 'site_login_pw', 'admin_login_pw'] as $pwField) {
                        if (!empty($serverInfo[$pwField])) {
                            $serverInfo[$pwField] = decryptValue($serverInfo[$pwField]);
                        }
                    }
                    logMsg("게시글 #{$post['id']}: 서버 정보 확인 - {$serverInfo['display_name']} ({$serverInfo['server_ip']})");
                }
            }

            // 서버 실시간 진단 실행 (서버 정보가 있는 경우)
            $diagnostics = null;
            if ($serverInfo) {
                logMsg("게시글 #{$post['id']}: 서버 진단 실행 중 ({$serverInfo['server_ip']})...");
                $diagnostics = runServerDiagnostics($serverInfo);
                if ($diagnostics) {
                    logMsg("게시글 #{$post['id']}: 서버 진단 완료 (" . count($diagnostics) . "개 항목 수집)");
                } else {
                    logMsg("게시글 #{$post['id']}: 서버 진단 실패 (접속 불가)");
                }
            }

            // AI 분석 (트랜잭션 밖에서 - 시간이 걸릴 수 있음)
            logMsg("게시글 #{$post['id']}: AI 분석 중...");
            $analysis = analyzePostWithAI($post['title'], $post['content'], $post['category'], $adminFeedback, $serverInfo, $diagnostics);
            logMsg("게시글 #{$post['id']}: AI 분석 완료");

            // 4. 분석 결과 저장 + pending_approval로 전환
            $db->beginTransaction();

            // 상태를 pending_approval로 변경
            $stmt = $db->prepare("UPDATE posts SET status = 'pending_approval' WHERE id = ? AND status = 'ai_review'");
            $stmt->execute([$post['id']]);

            if ($stmt->rowCount() === 0) {
                $db->rollBack();
                logMsg("게시글 #{$post['id']}: 상태 변경 실패 (이미 변경됨)");
                continue;
            }

            // 프로세스 로그: AI 분석 결과 + 승인 요청
            $logContent = "AI 분석이 완료되었습니다. 관리자 승인을 대기합니다.\n\n" . $analysis;
            $stmt = $db->prepare("INSERT INTO process_logs (post_id, step, content) VALUES (?, 'pending_approval', ?)");
            $stmt->execute([$post['id'], $logContent]);

            // AI 분석 결과를 댓글로도 등록 (관리자 이름으로)
            $adminName = getRandomAdminName();
            $commentContent = "📊 AI 분석 결과\n\n" . $analysis;
            $stmt = $db->prepare("INSERT INTO comments (post_id, content, author_name, is_ai_answer) VALUES (?, ?, ?, 1)");
            $stmt->execute([$post['id'], $commentContent, $adminName]);

            $db->commit();

            // 5. 텔레그램으로 관리자에게 승인 요청 알림
            $siteName = $post['user_site'] ?? '알 수 없음';
            $telegramMsg = "🤖 AI 분석 완료 - 승인 요청\n\n";
            $telegramMsg .= "📌 게시글 #{$post['id']}\n";
            $telegramMsg .= "📂 카테고리: {$post['category']}\n";
            $telegramMsg .= "📝 제목: {$post['title']}\n";
            $telegramMsg .= "🏢 사이트: {$siteName}\n\n";
            $telegramMsg .= "AI가 문의를 분석하고 처리 방안을 도출했습니다.\n관리자 페이지에서 확인 후 승인해주세요.";
            sendTelegramNotification($telegramMsg);

            logMsg("게시글 #{$post['id']}: pending_approval 전환 + 텔레그램 알림 완료");

        } catch (Exception $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            logMsg("게시글 #{$post['id']} 처리 실패: " . $e->getMessage());

            // AI 실패 시 상태를 registered로 복구 (다음 cron에서 재시도)
            try {
                $stmt = $db->prepare("UPDATE posts SET status = 'registered' WHERE id = ? AND status = 'ai_review'");
                $stmt->execute([$post['id']]);
                if ($stmt->rowCount() > 0) {
                    logMsg("게시글 #{$post['id']}: registered로 복구 완료 (다음 실행 시 재시도)");
                    // 실패 로그도 삭제 (깨끗한 재시도를 위해)
                    $db->prepare("DELETE FROM process_logs WHERE post_id = ? AND step = 'ai_review' ORDER BY created_at DESC LIMIT 1")->execute([$post['id']]);
                }
            } catch (Exception $recoveryEx) {
                logMsg("게시글 #{$post['id']}: 복구 실패 - " . $recoveryEx->getMessage());
            }

            // 실패 시에도 텔레그램으로 알림
            $errorMsg = "⚠️ AI 처리 오류\n게시글 #{$post['id']}: {$post['title']}\n오류: " . $e->getMessage();
            sendTelegramNotification($errorMsg);
        }

        // API 호출 간격 (Rate limit 방지)
        sleep(2);
    }

    logMsg('AI 처리 완료');

} catch (Exception $e) {
    logMsg('치명적 오류: ' . $e->getMessage());
    exit(1);
}
