<?php
require_once 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

try {
    if (!isset($_FILES['file'])) {
        throw new Exception('No file uploaded');
    }

    $uploadedFile = $_FILES['file'];
    $fileInfo = uploadFile($uploadedFile);

    jsonResponse([
        'message' => 'File uploaded successfully',
        'file' => $fileInfo
    ], 201);

} catch (Exception $e) {
    jsonResponse(['error' => $e->getMessage()], 400);
}
