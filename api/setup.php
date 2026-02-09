<?php
/**
 * 초기 데이터 설정 스크립트
 * 서버에서 1회 실행: php api/setup.php
 */
require_once __DIR__ . '/config.php';

$db = getDB();

// 테이블 ALTER (기존 테이블에 컬럼 추가)
$alterQueries = [
    // users 테이블: role, site 추가
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS role ENUM('admin','user') NOT NULL DEFAULT 'user'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS site VARCHAR(50) DEFAULT NULL",
    "ALTER TABLE users ADD INDEX IF NOT EXISTS idx_role (role)",
    "ALTER TABLE users ADD INDEX IF NOT EXISTS idx_site (site)",
    // posts 테이블: category, user_id 추가
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS category ENUM('긴급','오류','건의','추가개발','기타') NOT NULL DEFAULT '기타'",
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS user_id INT DEFAULT NULL",
    "ALTER TABLE posts ADD INDEX IF NOT EXISTS idx_category (category)",
    "ALTER TABLE posts ADD INDEX IF NOT EXISTS idx_user_id (user_id)",
];

foreach ($alterQueries as $sql) {
    try {
        $db->exec($sql);
        echo "OK: {$sql}\n";
    } catch (PDOException $e) {
        echo "SKIP: {$e->getMessage()}\n";
    }
}

// 기본 계정 생성
$users = [
    ['admin', 'admin1234', '관리자', 'admin', null],
    ['man', '12341234', '맨하탄', 'user', '맨하탄'],
    ['ganzi', '12341234', '간지', 'user', '간지'],
];

$stmt = $db->prepare("SELECT id FROM users WHERE username = ?");
$insert = $db->prepare("INSERT INTO users (username, password_hash, display_name, role, site) VALUES (?, ?, ?, ?, ?)");

foreach ($users as [$username, $password, $displayName, $role, $site]) {
    $stmt->execute([$username]);
    if ($stmt->fetch()) {
        // 기존 유저 role/site 업데이트
        $db->prepare("UPDATE users SET role = ?, site = ? WHERE username = ?")
           ->execute([$role, $site, $username]);
        echo "UPDATED: {$username} (role={$role}, site={$site})\n";
    } else {
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $insert->execute([$username, $hash, $displayName, $role, $site]);
        echo "CREATED: {$username} / {$password} (role={$role}, site={$site})\n";
    }
}

echo "\n설정 완료!\n";
