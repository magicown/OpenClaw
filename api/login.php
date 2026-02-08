<?php
session_start();
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

// GET: 현재 로그인 상태 확인
if ($method === 'GET') {
    if (isset($_SESSION['user_id'])) {
        jsonResponse([
            'logged_in' => true,
            'user' => [
                'id' => $_SESSION['user_id'],
                'username' => $_SESSION['username'],
                'display_name' => $_SESSION['display_name'],
            ]
        ]);
    } else {
        jsonResponse(['logged_in' => false]);
    }
}

// POST: 로그인
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);

    $username = trim($input['username'] ?? '');
    $password = $input['password'] ?? '';

    if (empty($username) || empty($password)) {
        jsonResponse(['error' => '아이디와 비밀번호를 입력해주세요.'], 400);
    }

    $db = getDB();
    $stmt = $db->prepare('SELECT id, username, password_hash, display_name FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        jsonResponse(['error' => '아이디 또는 비밀번호가 올바르지 않습니다.'], 401);
    }

    // 세션에 사용자 정보 저장
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['display_name'] = $user['display_name'];

    jsonResponse([
        'message' => '로그인 성공',
        'user' => [
            'id' => $user['id'],
            'username' => $user['username'],
            'display_name' => $user['display_name'],
        ]
    ]);
}

// DELETE: 로그아웃
if ($method === 'DELETE') {
    session_destroy();
    jsonResponse(['message' => '로그아웃 되었습니다.']);
}

jsonResponse(['error' => 'Method not allowed'], 405);
