<?php
/**
 * 텔레그램 웹훅 엔드포인트
 *
 * 인라인 버튼 콜백 수신:
 *   approve_{postId}_{analysisId} → ai_execution 전환
 *   reject_{postId}_{analysisId}  → 피드백 요청 메시지 전송
 *
 * 관리자 텍스트 메시지 → 거절 피드백으로 저장 → rework 전환
 *
 * 웹훅 등록: curl -s "https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://your-domain/api/telegram_webhook.php"
 */

require_once __DIR__ . '/config.php';

// 텔레그램에서 전송한 업데이트 데이터
$input = file_get_contents('php://input');
$update = json_decode($input, true);

if (!$update) {
    http_response_code(200);
    exit;
}

$db = getDB();

// ─── 콜백 쿼리 처리 (인라인 버튼 클릭) ───
if (isset($update['callback_query'])) {
    $callbackQuery = $update['callback_query'];
    $callbackData = $callbackQuery['data'] ?? '';
    $callbackId = $callbackQuery['id'];
    $chatId = $callbackQuery['message']['chat']['id'] ?? '';
    $messageId = $callbackQuery['message']['message_id'] ?? '';

    // 관리자 chat_id 검증
    if ((string)$chatId !== TELEGRAM_CHAT_ID) {
        answerCallback($callbackId, '권한이 없습니다.');
        exit;
    }

    // approve_{postId}_{analysisId}
    if (preg_match('/^approve_(\d+)_(\d+)$/', $callbackData, $matches)) {
        $postId = (int)$matches[1];
        $analysisId = (int)$matches[2];

        try {
            $db->beginTransaction();

            // 승인 처리: ai_execution으로 전환
            $stmt = $db->prepare("UPDATE posts SET status = 'ai_execution' WHERE id = ? AND status = 'pending_approval'");
            $stmt->execute([$postId]);

            if ($stmt->rowCount() === 0) {
                $db->rollBack();
                answerCallback($callbackId, '이미 처리된 게시글입니다.');
                exit;
            }

            // 텔레그램 승인 기록 업데이트
            $db->prepare("UPDATE telegram_approvals SET action = 'approved', acted_at = NOW() WHERE post_id = ? AND analysis_id = ? AND action = 'pending'")
                ->execute([$postId, $analysisId]);

            // 프로세스 로그
            $db->prepare("INSERT INTO process_logs (post_id, step, content) VALUES (?, 'ai_execution', '관리자가 텔레그램에서 승인하였습니다. 서버 수정을 시작합니다.')")
                ->execute([$postId]);

            $db->commit();

            // 텔레그램 메시지 수정 (버튼 제거 + 승인 표시)
            editTelegramMessage($chatId, $messageId, $callbackQuery['message']['text'] . "\n\n✅ 승인됨 — 서버 수정을 시작합니다.");
            answerCallback($callbackId, '승인 완료! 서버 수정을 시작합니다.');

        } catch (Exception $e) {
            if ($db->inTransaction()) $db->rollBack();
            answerCallback($callbackId, '오류: ' . $e->getMessage());
        }

        exit;
    }

    // reject_{postId}_{analysisId}
    if (preg_match('/^reject_(\d+)_(\d+)$/', $callbackData, $matches)) {
        $postId = (int)$matches[1];
        $analysisId = (int)$matches[2];

        try {
            // 텔레그램 승인 기록 업데이트 (거절 대기 — 피드백 수신 후 완료)
            $db->prepare("UPDATE telegram_approvals SET action = 'rejected', acted_at = NOW() WHERE post_id = ? AND analysis_id = ? AND action = 'pending'")
                ->execute([$postId, $analysisId]);

            // 피드백 요청 메시지 전송
            editTelegramMessage($chatId, $messageId, $callbackQuery['message']['text'] . "\n\n❌ 거절됨 — 피드백을 입력해주세요.");
            sendTelegramNotification("📝 게시글 #{$postId} 거절 피드백을 입력해주세요.\n\n거절 이유나 수정 방향을 텍스트로 보내주세요.\n(다음 텍스트 메시지가 피드백으로 저장됩니다)");

            // 임시 상태로 피드백 대기 표시 (post의 status는 아직 pending_approval 유지)
            // 피드백이 들어오면 rework로 전환

            answerCallback($callbackId, '거절 완료. 피드백을 입력해주세요.');

        } catch (Exception $e) {
            answerCallback($callbackId, '오류: ' . $e->getMessage());
        }

        exit;
    }

    answerCallback($callbackId, '알 수 없는 요청입니다.');
    exit;
}

// ─── 텍스트 메시지 처리 (거절 피드백) ───
if (isset($update['message']['text'])) {
    $chatId = $update['message']['chat']['id'] ?? '';
    $text = $update['message']['text'];

    // 관리자 chat_id 검증
    if ((string)$chatId !== TELEGRAM_CHAT_ID) {
        exit;
    }

    // 최근 거절된 승인 건 찾기 (피드백 미입력)
    $pendingFeedback = $db->prepare("
        SELECT ta.id, ta.post_id, ta.analysis_id, p.title
        FROM telegram_approvals ta
        JOIN posts p ON ta.post_id = p.id
        WHERE ta.action = 'rejected' AND ta.admin_feedback IS NULL
        ORDER BY ta.acted_at DESC LIMIT 1
    ");
    $pendingFeedback->execute();
    $feedbackTarget = $pendingFeedback->fetch();

    if ($feedbackTarget) {
        try {
            $db->beginTransaction();

            // 피드백 저장
            $db->prepare("UPDATE telegram_approvals SET admin_feedback = ? WHERE id = ?")
                ->execute([$text, $feedbackTarget['id']]);

            // rework 상태로 전환
            $db->prepare("UPDATE posts SET status = 'rework' WHERE id = ?")
                ->execute([$feedbackTarget['post_id']]);

            // 프로세스 로그
            $db->prepare("INSERT INTO process_logs (post_id, step, content) VALUES (?, 'rework', ?)")
                ->execute([$feedbackTarget['post_id'], "[거절 피드백] {$text}"]);

            $db->commit();

            sendTelegramNotification("✅ 게시글 #{$feedbackTarget['post_id']} ({$feedbackTarget['title']})에 피드백이 저장되었습니다.\n재분석이 자동으로 시작됩니다.");

        } catch (Exception $e) {
            if ($db->inTransaction()) $db->rollBack();
            sendTelegramNotification("⚠️ 피드백 저장 오류: " . $e->getMessage());
        }
    }

    exit;
}

// 기타 업데이트는 무시
http_response_code(200);
exit;

// ─── 헬퍼 함수들 ───

function answerCallback($callbackId, $text) {
    $url = 'https://api.telegram.org/bot' . TELEGRAM_BOT_TOKEN . '/answerCallbackQuery';
    $payload = json_encode([
        'callback_query_id' => $callbackId,
        'text' => $text,
        'show_alert' => true,
    ]);

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);
    curl_exec($ch);
    curl_close($ch);
}

function editTelegramMessage($chatId, $messageId, $newText) {
    $url = 'https://api.telegram.org/bot' . TELEGRAM_BOT_TOKEN . '/editMessageText';
    $payload = json_encode([
        'chat_id' => $chatId,
        'message_id' => $messageId,
        'text' => $newText,
    ]);

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);
    curl_exec($ch);
    curl_close($ch);
}
