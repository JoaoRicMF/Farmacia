<?php
// Impede a listagem de diret坦rio e retorna erro JSON
error_reporting(E_ALL);
ini_set('display_errors', 0); // Erros v達o para o log, n達o para o navegador
header("Content-Type: application/json; charset=UTF-8");
http_response_code(403); // Forbidden
echo json_encode(["error" => "Acesso direto n達o permitido"]);
exit;
