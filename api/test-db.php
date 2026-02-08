<?php
try {
    $pdo = new PDO(
        "mysql:host=localhost;dbname=qna_board;charset=utf8mb4",
        'root',
        '',
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]
    );
    echo "Database connection successful!\n";
    $stmt = $pdo->query("SELECT COUNT(*) as count FROM posts");
    $result = $stmt->fetch();
    echo "Posts count: " . $result['count'] . "\n";
} catch (PDOException $e) {
    echo "Database connection failed: " . $e->getMessage() . "\n";
}
