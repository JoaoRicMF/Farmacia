<?php
// api/utils.php

use JetBrains\PhpStorm\NoReturn;

/**
 * Envia resposta JSON padronizada e encerra o script.
 * O atributo #[NoReturn] indica para a IDE que a execução para aqui.
 * * @param mixed $data Dados para enviar no corpo do JSON
 * @param int $httpCode Código HTTP (default 200)
 */
#[NoReturn]
function enviarResponse(mixed $data, int $httpCode = 200): void {
    // Limpa qualquer saída anterior (warnings, espaços em branco)
    if (ob_get_length()) ob_clean();

    header("Access-Control-Allow-Origin: *");
    header("Content-Type: application/json; charset=UTF-8");
    http_response_code($httpCode);

    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Verifica se o usuário está logado. Retorna 401 se não estiver.
 * Inicia a sessão se necessário.
 */
function verificarAuth(): void {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }

    if (!isset($_SESSION['user_id'])) {
        enviarResponse([
            "success" => false,
            "message" => "Sessão expirada. Faça login novamente."
        ], 401);
    }
}