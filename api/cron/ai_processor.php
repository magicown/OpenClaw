#!/usr/bin/env php
<?php
/**
 * AI 자동 처리 파이프라인 v2
 *
 * 3단계 분석 파이프라인:
 *   Phase 1: registered/rework → ai_preprocess (문의 정리)
 *   Phase 2: ai_preprocess → ai_pdca (PDCA 분석)
 *   Phase 3: ai_pdca → ai_impact → pending_approval (영향도 분석 + 텔레그램 승인 요청)
 *
 * Cron: * * * * * /usr/bin/php /home/qna-board/api/cron/ai_processor.php >> /home/qna-board/logs/ai_processor.log 2>&1
 */

// CLI 전용 실행
if (php_sapi_name() !== 'cli') {
    die('CLI only');
}

// config.php의 header() 호출 방지
ob_start();
require_once __DIR__ . '/../config.php';
ob_end_clean();

function logMsg($msg) {
    echo '[' . date('Y-m-d H:i:s') . '] ' . $msg . PHP_EOL;
}

// 중복 실행 방지
$lockFile = '/tmp/ai_processor.lock';
if (file_exists($lockFile)) {
    $lockTime = filemtime($lockFile);
    if (time() - $lockTime > 300) {
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

// rework 최대 반복 횟수
define('MAX_REWORK_ITERATIONS', 5);

try {
    $db = getDB();

    // ─── Phase 1: registered/rework → ai_preprocess (문의 정리) ───
    $stmt = $db->prepare("
        SELECT p.id, p.title, p.content, p.category, p.user_id,
               u.display_name as user_display_name, u.site as user_site
        FROM posts p
        LEFT JOIN users u ON p.user_id = u.id
        WHERE p.status IN ('registered', 'rework')
        ORDER BY p.created_at ASC
        LIMIT 5
    ");
    $stmt->execute();
    $posts = $stmt->fetchAll();

    // ─── Phase 2: ai_preprocess → ai_pdca (PDCA 분석) ───
    $stmt2 = $db->prepare("
        SELECT p.id, p.title, p.content, p.category, p.user_id,
               u.display_name as user_display_name, u.site as user_site
        FROM posts p
        LEFT JOIN users u ON p.user_id = u.id
        WHERE p.status = 'ai_preprocess'
        ORDER BY p.created_at ASC
        LIMIT 3
    ");
    $stmt2->execute();
    $preprocessedPosts = $stmt2->fetchAll();

    // ─── Phase 3: ai_pdca → ai_impact → pending_approval (영향도 분석) ───
    $stmt3 = $db->prepare("
        SELECT p.id, p.title, p.content, p.category, p.user_id,
               u.display_name as user_display_name, u.site as user_site
        FROM posts p
        LEFT JOIN users u ON p.user_id = u.id
        WHERE p.status = 'ai_pdca'
        ORDER BY p.created_at ASC
        LIMIT 3
    ");
    $stmt3->execute();
    $pdcaPosts = $stmt3->fetchAll();

    if (empty($posts) && empty($preprocessedPosts) && empty($pdcaPosts)) {
        logMsg('처리할 문의글이 없습니다.');
        exit(0);
    }

    // ═══════════════════════════════════════════════════════
    // Phase 1: 문의 정리 (registered/rework → ai_preprocess)
    // ═══════════════════════════════════════════════════════
    foreach ($posts as $post) {
        logMsg("[Phase 1] 게시글 #{$post['id']} 문의 정리 시작: {$post['title']}");

        try {
            // rework 반복 횟수 체크
            $iterStmt = $db->prepare("SELECT COUNT(*) as cnt FROM ai_analysis_results WHERE post_id = ? AND phase = 'preprocess'");
            $iterStmt->execute([$post['id']]);
            $iteration = (int)$iterStmt->fetch()['cnt'] + 1;

            if ($iteration > MAX_REWORK_ITERATIONS) {
                logMsg("게시글 #{$post['id']}: 최대 반복 횟수({MAX_REWORK_ITERATIONS}) 초과 — 건너뜁니다.");
                $db->prepare("UPDATE posts SET status = 'admin_confirm' WHERE id = ?")->execute([$post['id']]);
                $db->prepare("INSERT INTO process_logs (post_id, step, content) VALUES (?, 'admin_confirm', ?)")
                    ->execute([$post['id'], "자동 분석 최대 반복 횟수를 초과하여 관리자 확인이 필요합니다."]);
                sendTelegramNotification("⚠️ 게시글 #{$post['id']} 자동 분석 최대 반복({MAX_REWORK_ITERATIONS}회) 초과\n관리자 직접 확인이 필요합니다.");
                continue;
            }

            $db->beginTransaction();

            // 상태 전환: ai_preprocess
            $stmt = $db->prepare("UPDATE posts SET status = 'ai_preprocess' WHERE id = ? AND status IN ('registered', 'rework')");
            $stmt->execute([$post['id']]);

            if ($stmt->rowCount() === 0) {
                $db->rollBack();
                logMsg("게시글 #{$post['id']}: 이미 처리 중이거나 상태가 변경되었습니다.");
                continue;
            }

            $db->prepare("INSERT INTO process_logs (post_id, step, content) VALUES (?, 'ai_preprocess', '문의 내용을 정리하고 있습니다.')")
                ->execute([$post['id']]);

            $db->commit();

            // 첨부파일 메타데이터 조회
            $attStmt = $db->prepare("SELECT file_name, file_size, mime_type FROM attachments WHERE post_id = ?");
            $attStmt->execute([$post['id']]);
            $attachments = $attStmt->fetchAll();

            // AI 문의 정리 실행
            logMsg("게시글 #{$post['id']}: AI 문의 정리 중...");
            $organizedQuestion = organizeQuestionWithAI($post['title'], $post['content'], $post['category'], $attachments);
            logMsg("게시글 #{$post['id']}: 문의 정리 완료");

            // 결과 저장
            $db->beginTransaction();

            $db->prepare("INSERT INTO ai_analysis_results (post_id, phase, iteration, organized_question, raw_claude_output, status) VALUES (?, 'preprocess', ?, ?, ?, 'completed')")
                ->execute([$post['id'], $iteration, $organizedQuestion, $organizedQuestion]);

            $db->prepare("INSERT INTO process_logs (post_id, step, content) VALUES (?, 'ai_preprocess', ?)")
                ->execute([$post['id'], "문의 정리 완료\n\n" . $organizedQuestion]);

            $db->commit();
            logMsg("게시글 #{$post['id']}: Phase 1 완료 — ai_preprocess 상태 유지 (Phase 2 대기)");

        } catch (Exception $e) {
            if ($db->inTransaction()) $db->rollBack();
            logMsg("게시글 #{$post['id']} Phase 1 실패: " . $e->getMessage());

            // 실패 시 복구
            try {
                $db->prepare("UPDATE posts SET status = 'registered' WHERE id = ? AND status = 'ai_preprocess'")->execute([$post['id']]);
                $db->prepare("DELETE FROM process_logs WHERE post_id = ? AND step = 'ai_preprocess' ORDER BY created_at DESC LIMIT 1")->execute([$post['id']]);
                logMsg("게시글 #{$post['id']}: registered로 복구 완료");
            } catch (Exception $ex) {
                logMsg("게시글 #{$post['id']}: 복구 실패 - " . $ex->getMessage());
            }

            sendTelegramNotification("⚠️ AI Phase 1 오류\n게시글 #{$post['id']}: {$post['title']}\n오류: " . $e->getMessage());
        }

        sleep(2);
    }

    // ═══════════════════════════════════════════════════════
    // Phase 2: PDCA 분석 (ai_preprocess → ai_pdca)
    // ═══════════════════════════════════════════════════════
    foreach ($preprocessedPosts as $post) {
        logMsg("[Phase 2] 게시글 #{$post['id']} PDCA 분석 시작: {$post['title']}");

        try {
            // 이전 Phase 1 결과 조회
            $prevStmt = $db->prepare("SELECT organized_question FROM ai_analysis_results WHERE post_id = ? AND phase = 'preprocess' AND status = 'completed' ORDER BY created_at DESC LIMIT 1");
            $prevStmt->execute([$post['id']]);
            $prevResult = $prevStmt->fetch();

            if (!$prevResult) {
                logMsg("게시글 #{$post['id']}: Phase 1 결과가 없습니다. 건너뜁니다.");
                continue;
            }

            $organizedQuestion = $prevResult['organized_question'];

            // 상태 전환
            $db->beginTransaction();
            $stmt = $db->prepare("UPDATE posts SET status = 'ai_pdca' WHERE id = ? AND status = 'ai_preprocess'");
            $stmt->execute([$post['id']]);

            if ($stmt->rowCount() === 0) {
                $db->rollBack();
                continue;
            }

            $db->prepare("INSERT INTO process_logs (post_id, step, content) VALUES (?, 'ai_pdca', '해결 방안을 분석하고 있습니다.')")
                ->execute([$post['id']]);
            $db->commit();

            // 관리자 피드백 확인 (rework에서 온 경우)
            $feedbackStmt = $db->prepare("
                SELECT admin_feedback FROM telegram_approvals
                WHERE post_id = ? AND action = 'rejected'
                ORDER BY created_at DESC LIMIT 1
            ");
            $feedbackStmt->execute([$post['id']]);
            $feedbackRow = $feedbackStmt->fetch();
            $adminFeedback = $feedbackRow ? $feedbackRow['admin_feedback'] : null;

            // 기존 process_logs에서도 피드백 확인
            if (!$adminFeedback) {
                $fbStmt = $db->prepare("SELECT content FROM process_logs WHERE post_id = ? AND content LIKE '[재확인 요청]%' ORDER BY created_at DESC LIMIT 1");
                $fbStmt->execute([$post['id']]);
                $fbRow = $fbStmt->fetch();
                $adminFeedback = $fbRow ? $fbRow['content'] : null;
            }

            if ($adminFeedback) {
                logMsg("게시글 #{$post['id']}: 관리자 피드백 발견 — 피드백 반영 분석");
            }

            // 서버 정보 조회 + 진단
            $serverInfo = null;
            $diagnostics = null;
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
                    logMsg("게시글 #{$post['id']}: 서버 진단 실행 중...");
                    $diagnostics = runServerDiagnostics($serverInfo);
                    logMsg("게시글 #{$post['id']}: 서버 진단 " . ($diagnostics ? '완료' : '실패'));
                }
            }

            // PDCA 분석 실행
            logMsg("게시글 #{$post['id']}: PDCA 분석 중...");
            $pdcaPlan = runPDCAWithClaude($organizedQuestion, $serverInfo, $diagnostics, $adminFeedback);
            logMsg("게시글 #{$post['id']}: PDCA 분석 완료");

            // 결과 저장
            $iterStmt = $db->prepare("SELECT COUNT(*) as cnt FROM ai_analysis_results WHERE post_id = ? AND phase = 'pdca'");
            $iterStmt->execute([$post['id']]);
            $iteration = (int)$iterStmt->fetch()['cnt'] + 1;

            $db->beginTransaction();

            $db->prepare("INSERT INTO ai_analysis_results (post_id, phase, iteration, pdca_plan, raw_claude_output, admin_feedback, status) VALUES (?, 'pdca', ?, ?, ?, ?, 'completed')")
                ->execute([$post['id'], $iteration, $pdcaPlan, $pdcaPlan, $adminFeedback]);

            $db->prepare("INSERT INTO process_logs (post_id, step, content) VALUES (?, 'ai_pdca', ?)")
                ->execute([$post['id'], "PDCA 분석 완료\n\n" . $pdcaPlan]);

            $db->commit();
            logMsg("게시글 #{$post['id']}: Phase 2 완료 — ai_pdca 상태 유지 (Phase 3 대기)");

        } catch (Exception $e) {
            if ($db->inTransaction()) $db->rollBack();
            logMsg("게시글 #{$post['id']} Phase 2 실패: " . $e->getMessage());

            try {
                $db->prepare("UPDATE posts SET status = 'ai_preprocess' WHERE id = ? AND status = 'ai_pdca'")->execute([$post['id']]);
                logMsg("게시글 #{$post['id']}: ai_preprocess로 복구 완료");
            } catch (Exception $ex) {
                logMsg("게시글 #{$post['id']}: 복구 실패 - " . $ex->getMessage());
            }

            sendTelegramNotification("⚠️ AI Phase 2 오류\n게시글 #{$post['id']}: {$post['title']}\n오류: " . $e->getMessage());
        }

        sleep(2);
    }

    // ═══════════════════════════════════════════════════════
    // Phase 3: 영향도 분석 (ai_pdca → ai_impact → pending_approval)
    // ═══════════════════════════════════════════════════════
    foreach ($pdcaPosts as $post) {
        logMsg("[Phase 3] 게시글 #{$post['id']} 영향도 분석 시작: {$post['title']}");

        try {
            // 이전 PDCA 결과 조회
            $prevStmt = $db->prepare("SELECT id, pdca_plan FROM ai_analysis_results WHERE post_id = ? AND phase = 'pdca' AND status = 'completed' ORDER BY created_at DESC LIMIT 1");
            $prevStmt->execute([$post['id']]);
            $prevResult = $prevStmt->fetch();

            if (!$prevResult) {
                logMsg("게시글 #{$post['id']}: PDCA 결과가 없습니다. 건너뜁니다.");
                continue;
            }

            $pdcaPlan = $prevResult['pdca_plan'];
            $pdcaAnalysisId = $prevResult['id'];

            // 상태 전환: ai_impact
            $db->beginTransaction();
            $stmt = $db->prepare("UPDATE posts SET status = 'ai_impact' WHERE id = ? AND status = 'ai_pdca'");
            $stmt->execute([$post['id']]);

            if ($stmt->rowCount() === 0) {
                $db->rollBack();
                continue;
            }

            $db->prepare("INSERT INTO process_logs (post_id, step, content) VALUES (?, 'ai_impact', '수정 작업의 영향을 분석하고 있습니다.')")
                ->execute([$post['id']]);
            $db->commit();

            // 서버 정보 + 진단 재수집
            $serverInfo = null;
            $diagnostics = null;
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
                    logMsg("게시글 #{$post['id']}: 영향도 분석을 위한 서버 재진단 중...");
                    $diagnostics = runServerDiagnostics($serverInfo);
                }
            }

            // 영향도 분석 실행
            logMsg("게시글 #{$post['id']}: 영향도 분석 중...");
            $impactAnalysis = analyzeImpactWithAI($pdcaPlan, $serverInfo, $diagnostics);
            logMsg("게시글 #{$post['id']}: 영향도 분석 완료");

            // 자동/수동 처리 모드 확인
            $modeStmt = $db->prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'auto_process_mode'");
            $modeStmt->execute();
            $autoMode = ($modeStmt->fetchColumn() ?: 'manual') === 'auto';

            // 결과 저장
            $db->beginTransaction();

            $db->prepare("INSERT INTO ai_analysis_results (post_id, phase, iteration, impact_analysis, raw_claude_output, status) VALUES (?, 'impact', 1, ?, ?, 'completed')")
                ->execute([$post['id'], $impactAnalysis, $impactAnalysis]);

            if ($autoMode) {
                // 자동 모드: 승인 없이 바로 ai_execution으로 전환
                $db->prepare("UPDATE posts SET status = 'ai_execution' WHERE id = ?")->execute([$post['id']]);

                $fullAnalysis = "PDCA 분석 + 영향도 분석이 완료되었습니다. [자동 모드] 승인 없이 서버 수정을 시작합니다.\n\n" . $pdcaPlan . "\n\n---\n\n" . $impactAnalysis;
                $db->prepare("INSERT INTO process_logs (post_id, step, content) VALUES (?, 'ai_execution', ?)")
                    ->execute([$post['id'], $fullAnalysis]);
            } else {
                // 수동 모드: pending_approval로 전환 (관리자 승인 대기)
                $db->prepare("UPDATE posts SET status = 'pending_approval' WHERE id = ?")->execute([$post['id']]);

                $fullAnalysis = "PDCA 분석 + 영향도 분석이 완료되었습니다. 관리자 승인을 대기합니다.\n\n" . $pdcaPlan . "\n\n---\n\n" . $impactAnalysis;
                $db->prepare("INSERT INTO process_logs (post_id, step, content) VALUES (?, 'pending_approval', ?)")
                    ->execute([$post['id'], $fullAnalysis]);
            }

            // AI 분석 결과를 댓글로 등록
            $adminName = getRandomAdminName();
            $commentContent = "📊 PDCA 분석 + 영향도 분석 결과\n\n" . $pdcaPlan . "\n\n" . $impactAnalysis;
            $db->prepare("INSERT INTO comments (post_id, content, author_name, is_ai_answer) VALUES (?, ?, ?, 1)")
                ->execute([$post['id'], $commentContent, $adminName]);

            $db->commit();

            // 텔레그램 알림
            $siteName = $post['user_site'] ?? '알 수 없음';

            // 영향도에서 위험도 등급 추출
            $riskLevel = '확인 필요';
            if (preg_match('/등급:\s*(낮음|중간|높음|매우높음)/u', $impactAnalysis, $matches)) {
                $riskLevel = $matches[1];
            }

            // 다운타임 추출
            $downtime = '확인 필요';
            if (preg_match('/다운타임:\s*([^\n]+)/u', $impactAnalysis, $matches)) {
                $downtime = trim($matches[1]);
            }

            $telegramMsg = "📋 문의: {$post['title']}\n";
            $telegramMsg .= "🏢 사이트: {$siteName}\n";
            $telegramMsg .= "📂 카테고리: {$post['category']}\n\n";

            $pdcaLines = explode("\n", $pdcaPlan);
            $pdcaSummary = implode("\n", array_slice($pdcaLines, 0, 8));
            $telegramMsg .= "💡 수정 방안:\n{$pdcaSummary}\n\n";

            $telegramMsg .= "⚠️ 영향도: {$riskLevel}\n";
            $telegramMsg .= "  - 다운타임: {$downtime}\n";

            if ($autoMode) {
                // 자동 모드: 승인 버튼 없이 알림만
                $telegramMsg .= "\n🤖 [자동 모드] 승인 없이 서버 수정을 바로 시작합니다.";
                sendTelegramNotification($telegramMsg);
            } else {
                // 수동 모드: 인라인 버튼 포함 승인 요청
                $buttons = [[
                    ['text' => '✅ 승인', 'callback_data' => "approve_{$post['id']}_{$pdcaAnalysisId}"],
                    ['text' => '❌ 거절', 'callback_data' => "reject_{$post['id']}_{$pdcaAnalysisId}"],
                ]];

                $messageId = sendTelegramWithInlineKeyboard($telegramMsg, $buttons);

                if ($messageId) {
                    $db->prepare("INSERT INTO telegram_approvals (post_id, analysis_id, telegram_message_id, callback_data, action) VALUES (?, ?, ?, ?, 'pending')")
                        ->execute([$post['id'], $pdcaAnalysisId, $messageId, "approve_{$post['id']}_{$pdcaAnalysisId}"]);
                }
            }

            $modeLabel = $autoMode ? '자동 모드 → ai_execution' : '수동 모드 → pending_approval';
            logMsg("게시글 #{$post['id']}: Phase 3 완료 — {$modeLabel}");

        } catch (Exception $e) {
            if ($db->inTransaction()) $db->rollBack();
            logMsg("게시글 #{$post['id']} Phase 3 실패: " . $e->getMessage());

            try {
                $db->prepare("UPDATE posts SET status = 'ai_pdca' WHERE id = ? AND status IN ('ai_impact', 'pending_approval')")->execute([$post['id']]);
                logMsg("게시글 #{$post['id']}: ai_pdca로 복구 완료");
            } catch (Exception $ex) {
                logMsg("게시글 #{$post['id']}: 복구 실패 - " . $ex->getMessage());
            }

            sendTelegramNotification("⚠️ AI Phase 3 오류\n게시글 #{$post['id']}: {$post['title']}\n오류: " . $e->getMessage());
        }

        sleep(2);
    }

    logMsg('AI 처리 완료');

} catch (Exception $e) {
    logMsg('치명적 오류: ' . $e->getMessage());
    exit(1);
}
