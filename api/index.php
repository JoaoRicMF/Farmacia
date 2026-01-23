<?php
// Impede a listagem de diretório e retorna erro JSON
header("Content-Type: application/json");
http_response_code(403); // Forbidden
echo json_encode(["error" => "Acesso direto não permitido"]);
exit;
?>