<?php
require_once 'utils.php';
require_once 'Lib/MoneyUtils.php';

inicializarApi(); // Apenas headers, boleto pode ser público ou privado dependendo da regra

$input = getJsonInput();
$linha = preg_replace('/\D/', '', $input->codigo ?? '');

if (!$linha) enviarResponse(["error" => "Código vazio"], 400);

$response = [
    "valor" => 0.0,
    "vencimento" => null,
    "tipo" => "Desconhecido",
    "valido" => false
];

$tam = strlen($linha);

// --- Estratégia Pattern Matching ---

// 1. Concessionária (48 dígitos)
if ($tam == 48 && str_starts_with($linha, '8')) {
    $response['tipo'] = "Concessionária/Tributo";
    // Remove DV e extrai valor
    $blocos = [substr($linha, 0, 11), substr($linha, 12, 11), substr($linha, 24, 11), substr($linha, 36, 11)];
    $corpo = implode('', $blocos);
    
    // Valor: Posição 4 a 15 (11 digitos) -> Centavos
    $valorCents = (int) substr($corpo, 4, 11);
    $response['valor'] = MoneyUtils::fromCents($valorCents);
    $response['valido'] = true;
}
// 2. Bancário (47 dígitos)
elseif ($tam == 47) {
    $response['tipo'] = "Bancário";
    $fator = substr($linha, 33, 4);
    $valorCents = (int) substr($linha, 37); // Últimos 10 dígitos são o valor em centavos
    
    $response['valor'] = MoneyUtils::fromCents($valorCents);
    $response['vencimento'] = calcularVencimentoBancario($fator);
    $response['valido'] = true;
}
// 3. PIX
elseif (str_starts_with($input->codigo, '000201')) {
    $response['tipo'] = "PIX Copia e Cola";
    $response['valido'] = true;
}

enviarResponse($response);

function calcularVencimentoBancario($fator) {
    if (!$fator || $fator === '0000') return null;
    try {
        $base = new DateTime('1997-10-07');
        $base->modify("+$fator days");
        // Ajuste 2025 (Rollback do fator)
        if ($base < new DateTime('2025-02-22')) {
            $base->modify('+9000 days');
        }
        return $base->format('Y-m-d');
    } catch (Throwable $e) {
        return null;
    }
}
?>