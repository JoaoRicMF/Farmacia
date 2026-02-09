<?php
// api/utils.php
require_once __DIR__ . '/MoneyUtils.php'; // Inclua se criou o arquivo separado

// Configurações Globais
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

function inicializarApi(): void {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    header("Access-Control-Allow-Origin: *");
    header("Content-Type: application/json; charset=UTF-8");
}

function enviarResponse(mixed $data, int $httpCode = 200): void {
    if (ob_get_length()) ob_clean();
    http_response_code($httpCode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function verificarAuth(): void {
    inicializarApi();
    if (!isset($_SESSION['user_id'])) {
        enviarResponse(["success" => false, "message" => "Sessão expirada."], 401);
    }
}

function getJsonInput(): object {
    $input = json_decode(file_get_contents("php://input"));
    if (!$input) {
        enviarResponse(["success" => false, "message" => "JSON inválido."], 400);
    }
    return $input;
}