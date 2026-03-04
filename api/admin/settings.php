<?php
require_once __DIR__ . '/../config.php';

$admin = requireAdmin();
$db = getDB();
$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        $stmt = $db->query("SELECT setting_key, setting_value FROM system_settings");
        $rows = $stmt->fetchAll();
        $settings = [];
        foreach ($rows as $row) {
            $settings[$row['setting_key']] = $row['setting_value'];
        }
        jsonResponse($settings);
        break;

    case 'PUT':
        $input = json_decode(file_get_contents('php://input'), true);
        if (empty($input) || !is_array($input)) {
            jsonResponse(['error' => '설정 데이터가 필요합니다.'], 400);
        }

        $allowedKeys = ['auto_process_mode'];
        $updated = [];

        foreach ($input as $key => $value) {
            if (!in_array($key, $allowedKeys)) continue;

            $stmt = $db->prepare("INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?");
            $stmt->execute([$key, $value, $value]);
            $updated[$key] = $value;
        }

        jsonResponse(['message' => '설정이 저장되었습니다.', 'updated' => $updated]);
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
