<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$db = getDB();

switch ($method) {
    case 'GET':
        if (isset($_GET['post_id'])) {
            // 특정 게시글의 프로세스 로그 조회
            $stmt = $db->prepare("
                SELECT pl.*, u.display_name as creator_name
                FROM process_logs pl
                LEFT JOIN users u ON pl.created_by = u.id
                WHERE pl.post_id = ?
                ORDER BY pl.created_at ASC
            ");
            $stmt->execute([$_GET['post_id']]);
            jsonResponse($stmt->fetchAll());
        } else {
            // 전체 게시글 + 현재 상태 목록 (관리자용 대시보드)
            $admin = requireAdmin();

            $stepFilter = $_GET['step'] ?? '';
            $categoryFilter = $_GET['category'] ?? '';

            $where = ['1=1'];
            $params = [];

            if ($stepFilter) {
                $where[] = 'p.status = ?';
                $params[] = $stepFilter;
            }
            if ($categoryFilter) {
                $where[] = 'p.category = ?';
                $params[] = $categoryFilter;
            }

            $whereClause = implode(' AND ', $where);

            $stmt = $db->prepare("
                SELECT p.id, p.title, p.content, p.category, p.status, p.user_id,
                       p.created_at, p.updated_at,
                       u.display_name as user_display_name, u.site as user_site,
                       (SELECT COUNT(*) FROM process_logs WHERE post_id = p.id) as log_count,
                       (SELECT content FROM process_logs WHERE post_id = p.id ORDER BY created_at DESC LIMIT 1) as last_log
                FROM posts p
                LEFT JOIN users u ON p.user_id = u.id
                WHERE {$whereClause}
                ORDER BY
                    CASE p.status
                        WHEN 'registered' THEN 1
                        WHEN 'ai_review' THEN 2
                        WHEN 'pending_approval' THEN 3
                        WHEN 'ai_processing' THEN 4
                        WHEN 'admin_confirm' THEN 5
                        WHEN 'rework' THEN 6
                        WHEN 'completed' THEN 7
                        ELSE 8
                    END,
                    p.created_at DESC
            ");
            $stmt->execute($params);
            jsonResponse($stmt->fetchAll());
        }
        break;

    case 'POST':
        // 프로세스 상태 전이 (관리자만)
        $admin = requireAdmin();
        $data = json_decode(file_get_contents('php://input'), true);

        $postId = $data['post_id'] ?? null;
        $newStep = $data['step'] ?? null;
        $content = $data['content'] ?? '';

        if (!$postId || !$newStep) {
            jsonResponse(['error' => 'post_id와 step은 필수입니다.'], 400);
        }

        $validSteps = ['registered', 'ai_review', 'pending_approval', 'ai_processing', 'completed', 'admin_confirm', 'rework'];
        if (!in_array($newStep, $validSteps)) {
            jsonResponse(['error' => '유효하지 않은 단계입니다.'], 400);
        }

        // 게시글 존재 확인
        $stmt = $db->prepare("SELECT id, status FROM posts WHERE id = ?");
        $stmt->execute([$postId]);
        $post = $stmt->fetch();
        if (!$post) {
            jsonResponse(['error' => '존재하지 않는 게시글입니다.'], 404);
        }

        // 자동 로그 메시지
        $stepMessages = [
            'registered' => '문의글이 등록되었습니다.',
            'ai_review' => 'AI가 문의 내용을 분석하고 있습니다.',
            'pending_approval' => '관리자 승인을 대기하고 있습니다.',
            'ai_processing' => 'AI가 작업을 진행하고 있습니다.',
            'completed' => '작업이 완료되었습니다.',
            'admin_confirm' => '관리자 확인이 필요합니다.',
            'rework' => '재작업이 요청되었습니다.',
        ];

        $logContent = $content ?: $stepMessages[$newStep];

        try {
            $db->beginTransaction();

            // 상태 업데이트
            $stmt = $db->prepare("UPDATE posts SET status = ? WHERE id = ?");
            $stmt->execute([$newStep, $postId]);

            // 프로세스 로그 추가
            $stmt = $db->prepare("INSERT INTO process_logs (post_id, step, content, created_by) VALUES (?, ?, ?, ?)");
            $stmt->execute([$postId, $newStep, $logContent, $admin['id']]);

            $logId = $db->lastInsertId();

            $db->commit();

            // 텔레그램 알림
            $telegramMsg = "[처리절차 변경]\n게시글 #{$postId}\n단계: {$stepMessages[$newStep]}" . ($content ? "\n메모: {$content}" : "");
            sendTelegramNotification($telegramMsg);

            jsonResponse(['message' => '상태가 변경되었습니다.', 'log_id' => (int)$logId]);

        } catch (Exception $e) {
            $db->rollBack();
            jsonResponse(['error' => $e->getMessage()], 500);
        }
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
