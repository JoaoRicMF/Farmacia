<?php
// Impede a listagem de diretório e retorna erro JSON
error_reporting(E_ALL);
ini_set('display_errors', 0); // Erros vão para o log, não para o navegador
header("Content-Type: application/json; charset=UTF-8");
http_response_code(403); // Forbidden
echo json_encode(["error" => "Acesso direto não permitido"]);
exit;
