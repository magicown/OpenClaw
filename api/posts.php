<?php
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];
$db = getDB();

switch ($method) {
    case 'GET':
        // 게시글 목록 조회
        if (isset($_GET['id'])) {
            // 특정 게시글 조회 (users 테이블 JOIN)
            $stmt = $db->prepare("
                SELECT p.*, u.display_name as user_display_name, u.site as user_site,
                    (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
                    (SELECT COUNT(*) FROM attachments WHERE post_id = p.id) as attachment_count
                FROM posts p
                LEFT JOIN users u ON p.user_id = u.id
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

            // 프로세스 로그 조회
            $stmt = $db->prepare("
                SELECT pl.*, u.display_name as creator_name
                FROM process_logs pl
                LEFT JOIN users u ON pl.created_by = u.id
                WHERE pl.post_id = ?
                ORDER BY pl.created_at ASC
            ");
            $stmt->execute([$_GET['id']]);
            $post['process_logs'] = $stmt->fetchAll();

            jsonResponse($post);
        } else {
            // 게시글 목록 조회 (페이지네이션, users JOIN)
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

            if (!empty($_GET['category'])) {
                $where[] = 'p.category = ?';
                $params[] = $_GET['category'];
            }

            if (!empty($_GET['search'])) {
                $where[] = '(p.title LIKE ? OR p.content LIKE ?)';
                $searchTerm = '%' . $_GET['search'] . '%';
                $params[] = $searchTerm;
                $params[] = $searchTerm;
            }

            // 내 글만 필터 (mine=1이면 로그인 사용자 글만)
            if (!empty($_GET['mine'])) {
                if (session_status() === PHP_SESSION_NONE) session_start();
                if (isset($_SESSION['user_id'])) {
                    $where[] = 'p.user_id = ?';
                    $params[] = $_SESSION['user_id'];
                }
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
                SELECT p.*, u.display_name as user_display_name, u.site as user_site,
                    (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
                    (SELECT COUNT(*) FROM attachments WHERE post_id = p.id) as attachment_count
                FROM posts p
                LEFT JOIN users u ON p.user_id = u.id
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
        // 게시글 생성 (로그인 필수)
        $user = requireAuth();
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['title']) || empty($data['content']) || empty($data['category'])) {
            jsonResponse(['error' => 'Missing required fields (title, content, category)'], 400);
        }

        // 카테고리 유효성 검사
        $validCategories = ['긴급', '오류', '건의', '추가개발', '기타'];
        if (!in_array($data['category'], $validCategories)) {
            jsonResponse(['error' => 'Invalid category'], 400);
        }

        try {
            $db->beginTransaction();

            $stmt = $db->prepare("
                INSERT INTO posts (title, content, user_id, category, status)
                VALUES (?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $data['title'],
                $data['content'],
                $user['id'],
                $data['category'],
                'registered'
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

            // 자동 댓글 생성 (고정 메시지 + 랜덤 관리자 이름)
            $autoCommentContent = "해당 문제를 확인하고 있습니다. 확인되는데로 답변 드리겠습니다.";
            $adminName = getRandomAdminName();
            $stmt = $db->prepare("
                INSERT INTO comments (post_id, content, author_name, is_ai_answer)
                VALUES (?, ?, ?, ?)
            ");
            $stmt->execute([$postId, $autoCommentContent, $adminName, true]);

            // 프로세스 로그: 문의 등록
            $stmt = $db->prepare("INSERT INTO process_logs (post_id, step, content) VALUES (?, 'registered', '문의글이 등록되었습니다.')");
            $stmt->execute([$postId]);

            $db->commit();

            // 텔레그램 알림 전송 (트랜잭션 밖에서)
            $siteName = $user['site'] ?? '알 수 없음';
            $telegramMessage = "새로운 문의가 생성 되었습니다. [{$siteName}]\n제목: {$data['title']}\n카테고리: {$data['category']}";
            sendTelegramNotification($telegramMessage);

            jsonResponse(['message' => 'Post created successfully', 'post_id' => $postId], 201);

        } catch (Exception $e) {
            $db->rollBack();
            jsonResponse(['error' => $e->getMessage()], 500);
        }
        break;

    case 'PUT':
        // 게시글 상태 변경 (관리자만)
        $admin = requireAdmin();

        if (!isset($_GET['id'])) {
            jsonResponse(['error' => 'Post ID required'], 400);
        }

        $data = json_decode(file_get_contents('php://input'), true);
        if (empty($data['status']) || !in_array($data['status'], ['pending', 'answered', 'closed'])) {
            jsonResponse(['error' => 'Valid status required'], 400);
        }

        $stmt = $db->prepare("UPDATE posts SET status = ? WHERE id = ?");
        $stmt->execute([$data['status'], $_GET['id']]);
        jsonResponse(['message' => 'Status updated successfully']);
        break;

    case 'DELETE':
        // 게시글 삭제 (관리자만)
        $admin = requireAdmin();

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
