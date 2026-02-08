<?php
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];
$db = getDB();

switch ($method) {
    case 'GET':
        // 게시글 목록 조회
        if (isset($_GET['id'])) {
            // 특정 게시글 조회
            $stmt = $db->prepare("
                SELECT p.*,
                    (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
                    (SELECT COUNT(*) FROM attachments WHERE post_id = p.id) as attachment_count
                FROM posts p
                WHERE p.id = ?
            ");
            $stmt->execute([$_GET['id']]);
            $post = $stmt->fetch();

            if (!$post) {
                jsonResponse(['error' => 'Post not found'], 404);
            }

            // 조회수 증가
            $db->prepare("UPDATE posts SET view_count = view_count + 1 WHERE id = ?")->execute([$_GET['id']]);

            // 댓글 조회
            $stmt = $db->prepare("
                SELECT * FROM comments
                WHERE post_id = ?
                ORDER BY created_at ASC
            ");
            $stmt->execute([$_GET['id']]);
            $post['comments'] = $stmt->fetchAll();

            // 첨부파일 조회
            $stmt = $db->prepare("
                SELECT * FROM attachments
                WHERE post_id = ?
                ORDER BY created_at ASC
            ");
            $stmt->execute([$_GET['id']]);
            $post['attachments'] = $stmt->fetchAll();

            jsonResponse($post);
        } else {
            // 게시글 목록 조회 (페이지네이션)
            $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
            $limit = isset($_GET['limit']) ? min(100, max(1, intval($_GET['limit']))) : 10;
            $offset = ($page - 1) * $limit;

            // 필터
            $where = ['1=1'];
            $params = [];

            if (!empty($_GET['status'])) {
                $where[] = 'p.status = ?';
                $params[] = $_GET['status'];
            }

            if (!empty($_GET['search'])) {
                $where[] = '(p.title LIKE ? OR p.content LIKE ?)';
                $searchTerm = '%' . $_GET['search'] . '%';
                $params[] = $searchTerm;
                $params[] = $searchTerm;
            }

            $whereClause = implode(' AND ', $where);

            // 전체 개수
            $stmt = $db->prepare("
                SELECT COUNT(*) as total
                FROM posts p
                WHERE {$whereClause}
            ");
            $stmt->execute($params);
            $total = $stmt->fetch()['total'];

            // 게시글 목록
            $stmt = $db->prepare("
                SELECT p.*,
                    (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
                    (SELECT COUNT(*) FROM attachments WHERE post_id = p.id) as attachment_count
                FROM posts p
                WHERE {$whereClause}
                ORDER BY p.created_at DESC
                LIMIT {$limit} OFFSET {$offset}
            ");
            $stmt->execute($params);
            $posts = $stmt->fetchAll();

            jsonResponse([
                'data' => $posts,
                'pagination' => [
                    'page' => $page,
                    'limit' => $limit,
                    'total' => $total,
                    'totalPages' => ceil($total / $limit)
                ]
            ]);
        }
        break;

    case 'POST':
        // 게시글 생성
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['title']) || empty($data['content']) || empty($data['author_name'])) {
            jsonResponse(['error' => 'Missing required fields'], 400);
        }

        try {
            $db->beginTransaction();

            $stmt = $db->prepare("
                INSERT INTO posts (title, content, author_name, author_email, status)
                VALUES (?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $data['title'],
                $data['content'],
                $data['author_name'],
                $data['author_email'] ?? null,
                $data['status'] ?? 'pending'
            ]);

            $postId = $db->lastInsertId();

            // 첨부파일 처리
            if (isset($data['attachments']) && is_array($data['attachments'])) {
                $stmt = $db->prepare("
                    INSERT INTO attachments (post_id, file_name, file_path, file_size, mime_type, file_type)
                    VALUES (?, ?, ?, ?, ?, ?)
                ");

                foreach ($data['attachments'] as $attachment) {
                    $stmt->execute([
                        $postId,
                        $attachment['file_name'],
                        $attachment['file_path'],
                        $attachment['file_size'],
                        $attachment['mime_type'],
                        $attachment['file_type']
                    ]);
                }
            }

            $db->commit();

            // AI 답변 자동 생성 (필요시)
            if (isset($data['auto_ai_answer']) && $data['auto_ai_answer']) {
                $aiAnswer = generateAIAnswer($data['content']);

                $stmt = $db->prepare("
                    INSERT INTO comments (post_id, content, author_name, is_ai_answer)
                    VALUES (?, ?, 'AI Assistant', ?)
                ");
                $stmt->execute([$postId, $aiAnswer, true]);

                // 상태 업데이트
                $db->prepare("UPDATE posts SET status = 'answered' WHERE id = ?")->execute([$postId]);
            }

            jsonResponse(['message' => 'Post created successfully', 'post_id' => $postId], 201);

        } catch (Exception $e) {
            $db->rollBack();
            jsonResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'PUT':
        // 게시글 수정
        if (!isset($_GET['id'])) {
            jsonResponse(['error' => 'Post ID required'], 400);
        }

        $data = json_decode(file_get_contents('php://input'), true);

        try {
            $db->beginTransaction();

            $stmt = $db->prepare("
                UPDATE posts
                SET title = ?, content = ?, author_name = ?, author_email = ?, status = ?
                WHERE id = ?
            ");
            $stmt->execute([
                $data['title'] ?? '',
                $data['content'] ?? '',
                $data['author_name'] ?? '',
                $data['author_email'] ?? null,
                $data['status'] ?? 'pending',
                $_GET['id']
            ]);

            // 첨부파일 삭제
            if (isset($data['deleted_attachments']) && is_array($data['deleted_attachments'])) {
                $stmt = $db->prepare("DELETE FROM attachments WHERE id = ? AND post_id = ?");
                foreach ($data['deleted_attachments'] as $attachmentId) {
                    $stmt->execute([$attachmentId, $_GET['id']]);
                }
            }

            // 새 첨부파일 추가
            if (isset($data['new_attachments']) && is_array($data['new_attachments'])) {
                $stmt = $db->prepare("
                    INSERT INTO attachments (post_id, file_name, file_path, file_size, mime_type, file_type)
                    VALUES (?, ?, ?, ?, ?, ?)
                ");

                foreach ($data['new_attachments'] as $attachment) {
                    $stmt->execute([
                        $_GET['id'],
                        $attachment['file_name'],
                        $attachment['file_path'],
                        $attachment['file_size'],
                        $attachment['mime_type'],
                        $attachment['file_type']
                    ]);
                }
            }

            $db->commit();

            jsonResponse(['message' => 'Post updated successfully']);

        } catch (Exception $e) {
            $db->rollBack();
            jsonResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'DELETE':
        // 게시글 삭제
        if (!isset($_GET['id'])) {
            jsonResponse(['error' => 'Post ID required'], 400);
        }

        try {
            $db->beginTransaction();

            // 첨부파일 삭제 (파일 시스템에서도 삭제)
            $stmt = $db->prepare("SELECT file_path FROM attachments WHERE post_id = ?");
            $stmt->execute([$_GET['id']]);
            $attachments = $stmt->fetchAll();

            foreach ($attachments as $attachment) {
                if (file_exists($attachment['file_path'])) {
                    unlink($attachment['file_path']);
                }
            }

            // 게시글 삭제 (CASCADE로 댓글과 첨부파일도 삭제됨)
            $stmt = $db->prepare("DELETE FROM posts WHERE id = ?");
            $stmt->execute([$_GET['id']]);

            $db->commit();

            jsonResponse(['message' => 'Post deleted successfully']);

        } catch (Exception $e) {
            $db->rollBack();
            jsonResponse(['error' => $e->getMessage()], 500);
        }
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
        break;
}
