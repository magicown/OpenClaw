<?php
require_once 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

$data = json_decode(file_get_contents('php://input'), true);

if (empty($data['post_id']) || empty($data['question'])) {
    jsonResponse(['error' => 'Missing required fields'], 400);
}

try {
    $db = getDB();

    // 게시글 정보 가져오기
    $stmt = $db->prepare("SELECT * FROM posts WHERE id = ?");
    $stmt->execute([$data['post_id']]);
    $post = $stmt->fetch();

    if (!$post) {
        jsonResponse(['error' => 'Post not found'], 404);
    }

    // Google Gemini AI 답변 생성
    $aiAnswer = generateAIAnswer($data['question']);

    // 댓글로 저장
    $stmt = $db->prepare("
        INSERT INTO comments (post_id, content, author_name, is_ai_answer)
        VALUES (?, ?, 'AI Assistant', ?)
    ");
    $stmt->execute([$data['post_id'], $aiAnswer, true]);

    // 게시글 상태 업데이트
    $db->prepare("UPDATE posts SET status = 'answered' WHERE id = ?")->execute([$data['post_id']]);

    jsonResponse([
        'message' => 'AI answer generated successfully',
        'answer' => $aiAnswer
    ], 201);

} catch (Exception $e) {
    jsonResponse(['error' => $e->getMessage()], 500);
}
