<?php
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];
$db = getDB();

switch ($method) {
    case 'GET':
        // 댓글 목록 조회
        if (!isset($_GET['post_id'])) {
            jsonResponse(['error' => 'Post ID required'], 400);
        }

        $stmt = $db->prepare("
            SELECT * FROM comments
            WHERE post_id = ?
            ORDER BY created_at ASC
        ");
        $stmt->execute([$_GET['post_id']]);
        $comments = $stmt->fetchAll();

        jsonResponse($comments);
        break;

    case 'POST':
        // 댓글 생성 (관리자만)
        $admin = requireAdmin();
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['post_id']) || empty($data['content'])) {
            jsonResponse(['error' => 'Missing required fields'], 400);
        }

        try {
            $stmt = $db->prepare("
                INSERT INTO comments (post_id, content, author_name, is_ai_answer)
                VALUES (?, ?, ?, ?)
            ");
            $stmt->execute([
                $data['post_id'],
                $data['content'],
                $admin['display_name'],
                (int)($data['is_ai_answer'] ?? false)
            ]);

            $commentId = $db->lastInsertId();

            // 답변 등록 시 게시글 상태 업데이트
            $db->prepare("UPDATE posts SET status = 'answered' WHERE id = ?")->execute([$data['post_id']]);

            jsonResponse(['message' => 'Comment created successfully', 'comment_id' => $commentId], 201);

        } catch (Exception $e) {
            jsonResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'DELETE':
        // 댓글 삭제 (관리자만)
        $admin = requireAdmin();

        if (!isset($_GET['id'])) {
            jsonResponse(['error' => 'Comment ID required'], 400);
        }

        try {
            $stmt = $db->prepare("DELETE FROM comments WHERE id = ?");
            $stmt->execute([$_GET['id']]);

            jsonResponse(['message' => 'Comment deleted successfully']);

        } catch (Exception $e) {
            jsonResponse(['error' => $e->getMessage()], 500);
        }
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
        break;
}
