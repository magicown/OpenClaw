<?php
require_once __DIR__ . '/../config.php';

// 관리자 인증 필수
$user = requireAdmin();
$db = getDB();
$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        // 전체 회원 목록 조회
        $stmt = $db->query('SELECT id, username, display_name, email, role, site, created_at FROM users ORDER BY created_at DESC');
        $users = $stmt->fetchAll();
        jsonResponse($users);
        break;

    case 'POST':
        // 새 회원 생성
        $input = json_decode(file_get_contents('php://input'), true);

        $username = trim($input['username'] ?? '');
        $password = $input['password'] ?? '';
        $displayName = trim($input['display_name'] ?? '');
        $role = $input['role'] ?? 'user';
        $site = trim($input['site'] ?? '');
        $email = trim($input['email'] ?? '');

        if (!$username || !$password || !$displayName) {
            jsonResponse(['error' => 'username, password, display_name은 필수입니다.'], 400);
        }

        if (!in_array($role, ['admin', 'user'])) {
            jsonResponse(['error' => '유효하지 않은 role입니다.'], 400);
        }

        // 중복 username 체크
        $stmt = $db->prepare('SELECT id FROM users WHERE username = ?');
        $stmt->execute([$username]);
        if ($stmt->fetch()) {
            jsonResponse(['error' => '이미 존재하는 아이디입니다.'], 409);
        }

        $passwordHash = password_hash($password, PASSWORD_DEFAULT);

        $stmt = $db->prepare('INSERT INTO users (username, password_hash, display_name, email, role, site) VALUES (?, ?, ?, ?, ?, ?)');
        $stmt->execute([$username, $passwordHash, $displayName, $email ?: null, $role, $site ?: null]);

        $newId = $db->lastInsertId();
        jsonResponse(['message' => '회원이 생성되었습니다.', 'id' => (int)$newId], 201);
        break;

    case 'PUT':
        // 회원 정보 수정
        $id = $_GET['id'] ?? null;
        if (!$id) {
            jsonResponse(['error' => 'id 파라미터가 필요합니다.'], 400);
        }

        $input = json_decode(file_get_contents('php://input'), true);

        // 수정 대상 존재 확인
        $stmt = $db->prepare('SELECT id FROM users WHERE id = ?');
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            jsonResponse(['error' => '존재하지 않는 회원입니다.'], 404);
        }

        $fields = [];
        $values = [];

        if (isset($input['display_name']) && trim($input['display_name'])) {
            $fields[] = 'display_name = ?';
            $values[] = trim($input['display_name']);
        }
        if (isset($input['email'])) {
            $fields[] = 'email = ?';
            $values[] = trim($input['email']) ?: null;
        }
        if (isset($input['role']) && in_array($input['role'], ['admin', 'user'])) {
            $fields[] = 'role = ?';
            $values[] = $input['role'];
        }
        if (isset($input['site'])) {
            $fields[] = 'site = ?';
            $values[] = trim($input['site']) ?: null;
        }
        if (isset($input['password']) && $input['password'] !== '') {
            $fields[] = 'password_hash = ?';
            $values[] = password_hash($input['password'], PASSWORD_DEFAULT);
        }

        if (empty($fields)) {
            jsonResponse(['error' => '수정할 항목이 없습니다.'], 400);
        }

        $values[] = $id;
        $sql = 'UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?';
        $stmt = $db->prepare($sql);
        $stmt->execute($values);

        jsonResponse(['message' => '회원 정보가 수정되었습니다.']);
        break;

    case 'DELETE':
        // 회원 삭제
        $id = $_GET['id'] ?? null;
        if (!$id) {
            jsonResponse(['error' => 'id 파라미터가 필요합니다.'], 400);
        }

        // 자기 자신 삭제 방지
        if ((int)$id === $user['id']) {
            jsonResponse(['error' => '자기 자신은 삭제할 수 없습니다.'], 403);
        }

        // 삭제 대상 존재 확인
        $stmt = $db->prepare('SELECT id FROM users WHERE id = ?');
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            jsonResponse(['error' => '존재하지 않는 회원입니다.'], 404);
        }

        $stmt = $db->prepare('DELETE FROM users WHERE id = ?');
        $stmt->execute([$id]);

        jsonResponse(['message' => '회원이 삭제되었습니다.']);
        break;

    default:
        jsonResponse(['error' => '지원하지 않는 메서드입니다.'], 405);
}
