<?php
require_once __DIR__ . '/../config.php';

// 관리자 인증 필수
$user = requireAdmin();
$db = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// 비밀번호 필드 목록
$passwordFields = ['ssh_password', 'db_password', 'site_login_pw', 'admin_login_pw'];

switch ($method) {
    case 'GET':
        $id = $_GET['id'] ?? null;

        if ($id) {
            // 단건 조회 (비밀번호 복호화)
            $stmt = $db->prepare('SELECT * FROM servers WHERE id = ?');
            $stmt->execute([$id]);
            $server = $stmt->fetch();
            if (!$server) {
                jsonResponse(['error' => '존재하지 않는 서버입니다.'], 404);
            }
            foreach ($passwordFields as $field) {
                if (!empty($server[$field])) {
                    $server[$field] = decryptValue($server[$field]);
                }
            }
            jsonResponse($server);
        } else {
            // 전체 목록 (비밀번호는 마스킹)
            $stmt = $db->query('SELECT id, site_name, display_name, server_ip, ssh_user, db_user, site_url, site_login_id, admin_url, admin_login_id, notes, created_at, updated_at FROM servers ORDER BY id ASC');
            $servers = $stmt->fetchAll();
            jsonResponse($servers);
        }
        break;

    case 'POST':
        $input = json_decode(file_get_contents('php://input'), true);

        $siteName = trim($input['site_name'] ?? '');
        $displayName = trim($input['display_name'] ?? '');
        $serverIp = trim($input['server_ip'] ?? '');

        if (!$siteName || !$displayName || !$serverIp) {
            jsonResponse(['error' => '사이트명, 표시명, 서버 IP는 필수입니다.'], 400);
        }

        // 중복 site_name 체크
        $stmt = $db->prepare('SELECT id FROM servers WHERE site_name = ?');
        $stmt->execute([$siteName]);
        if ($stmt->fetch()) {
            jsonResponse(['error' => '이미 존재하는 사이트명입니다.'], 409);
        }

        // 비밀번호 암호화
        $sshPassword = !empty($input['ssh_password']) ? encryptValue($input['ssh_password']) : '';
        $dbPassword = !empty($input['db_password']) ? encryptValue($input['db_password']) : '';
        $siteLoginPw = !empty($input['site_login_pw']) ? encryptValue($input['site_login_pw']) : '';
        $adminLoginPw = !empty($input['admin_login_pw']) ? encryptValue($input['admin_login_pw']) : '';

        $stmt = $db->prepare('INSERT INTO servers (site_name, display_name, server_ip, ssh_user, ssh_password, db_user, db_password, site_url, site_login_id, site_login_pw, admin_url, admin_login_id, admin_login_pw, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $siteName,
            $displayName,
            $serverIp,
            trim($input['ssh_user'] ?? 'root'),
            $sshPassword,
            trim($input['db_user'] ?? 'root'),
            $dbPassword,
            trim($input['site_url'] ?? ''),
            trim($input['site_login_id'] ?? ''),
            $siteLoginPw,
            trim($input['admin_url'] ?? ''),
            trim($input['admin_login_id'] ?? ''),
            $adminLoginPw,
            trim($input['notes'] ?? '') ?: null,
        ]);

        jsonResponse(['message' => '서버가 등록되었습니다.', 'id' => (int)$db->lastInsertId()], 201);
        break;

    case 'PUT':
        $id = $_GET['id'] ?? null;
        if (!$id) {
            jsonResponse(['error' => 'id 파라미터가 필요합니다.'], 400);
        }

        $stmt = $db->prepare('SELECT id FROM servers WHERE id = ?');
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            jsonResponse(['error' => '존재하지 않는 서버입니다.'], 404);
        }

        $input = json_decode(file_get_contents('php://input'), true);

        $fields = [];
        $values = [];

        $textFields = ['site_name', 'display_name', 'server_ip', 'ssh_user', 'db_user', 'site_url', 'site_login_id', 'admin_url', 'admin_login_id', 'notes'];
        foreach ($textFields as $field) {
            if (isset($input[$field])) {
                $fields[] = "$field = ?";
                $values[] = trim($input[$field]) ?: null;
            }
        }

        // 비밀번호 필드는 암호화하여 저장 (빈 값이면 업데이트 안함)
        foreach ($passwordFields as $field) {
            if (isset($input[$field]) && $input[$field] !== '') {
                $fields[] = "$field = ?";
                $values[] = encryptValue($input[$field]);
            }
        }

        if (empty($fields)) {
            jsonResponse(['error' => '수정할 항목이 없습니다.'], 400);
        }

        $values[] = $id;
        $sql = 'UPDATE servers SET ' . implode(', ', $fields) . ' WHERE id = ?';
        $stmt = $db->prepare($sql);
        $stmt->execute($values);

        jsonResponse(['message' => '서버 정보가 수정되었습니다.']);
        break;

    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if (!$id) {
            jsonResponse(['error' => 'id 파라미터가 필요합니다.'], 400);
        }

        $stmt = $db->prepare('SELECT id FROM servers WHERE id = ?');
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            jsonResponse(['error' => '존재하지 않는 서버입니다.'], 404);
        }

        $stmt = $db->prepare('DELETE FROM servers WHERE id = ?');
        $stmt->execute([$id]);

        jsonResponse(['message' => '서버가 삭제되었습니다.']);
        break;

    default:
        jsonResponse(['error' => '지원하지 않는 메서드입니다.'], 405);
}
