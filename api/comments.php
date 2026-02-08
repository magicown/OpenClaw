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
        // 댓글 생성
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['post_id']) || empty($data['content']) || empty($data['author_name'])) {
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
                $data['author_name'],
                (int)($data['is_ai_answer'] ?? false)
            ]);

            $commentId = $db->lastInsertId();

            // AI 답변일 경우 게시글 상태 업데이트
            if (!empty($data['is_ai_answer'])) {
                $db->prepare("UPDATE posts SET status = 'answered' WHERE id = ?")->execute([$data['post_id']]);
            }

            jsonResponse(['message' => 'Comment created successfully', 'comment_id' => $commentId], 201);

        } catch (Exception $e) {
            jsonResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'DELETE':
        // 댓글 삭제
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
