<?php
error_reporting(E_ALL);
ini_set('display_errors', 0);
header("Content-Type: application/json; charset=UTF-8");

// Pega o input
$input = file_get_contents("php://input");
$data = json_decode($input);
$codigoOriginal = $data->codigo ?? '';

// Limpa tudo que não for número
$linha = preg_replace('/\D/', '', $codigoOriginal);

if (!$linha) {
    echo json_encode(["error" => "Código vazio ou inválido"]);
    exit;
}

$retorno = [
    "valor" => 0.0,
    "vencimento" => null,
    "tipo" => "Desconhecido",
    "valido" => false
];

$tam = strlen($linha);

// --- 1. BOLETOS DE CONCESSIONÁRIA / TRIBUTOS (48 DÍGITOS) ---
if (str_starts_with($linha, '8') && ($tam == 48 || $tam == 44)) {
    $retorno['tipo'] = "Concessionária/Tributo";

    if ($tam == 48) {
        // Remove os Dígitos Verificadores (posições 12, 24, 36, 48)
        $corpo = substr($linha, 0, 11) . substr($linha, 12, 11) . substr($linha, 24, 11) . substr($linha, 36, 11);
    } else {
        $corpo = $linha;
    }

    $valorStr = substr($corpo, 4, 11);
    $retorno['valor'] = floatval($valorStr) / 100;
    $retorno['valido'] = ($retorno['valor'] > 0);
}

// --- 2. BOLETOS BANCÁRIOS (47 DÍGITOS) ---
else if ($tam == 47 || $tam == 44) {
    $retorno['tipo'] = "Bancário";

    $fator = '';
    $valorStr = '';

    if ($tam == 47) {
        // Linha Digitável
        $fator = substr($linha, 33, 4);
        $valorStr = substr($linha, 37);
    } else {
        // Código de Barras (44 chars)
        $fator = substr($linha, 5, 4);
        $valorStr = substr($linha, 9, 10);
    }

    $retorno['valor'] = floatval($valorStr) / 100;

    // LÓGICA DE VENCIMENTO (PHP 8.3 SAFE)
    if ($fator && ctype_digit($fator) && $fator != '0000') {
        try {
            // Data Base padrão do Banco Central (07/10/1997)
            $dataBase = new DateTime('1997-10-07');

            // Adiciona o fator
            $dataBase->modify("+$fator days");

            /* ATUALIZAÇÃO 2025/2026:
               O fator "vencimento" reiniciou em 22/02/2025 (chegou a 9999 e voltou para 1000).

               Lógica: Se a data calculada for muito antiga (ex: antes do corte de 2025),
               significa que estamos no novo ciclo, então somamos 9000 dias.

               A data de corte segura é 2025-02-22.
            */
            $dataCorte = new DateTime('2025-02-22');

            // Se a data calculada for menor que o corte E estivermos operando após essa data
            // (Assumindo que ninguém está pagando boletos de 2005 hoje em dia)
            if ($dataBase < $dataCorte) {
                $dataBase->modify('+9000 days');
            }

            $retorno['vencimento'] = $dataBase->format('Y-m-d');

        } catch (Throwable $e) {
            // Captura DateMalformedStringException e outras falhas
            // Logar o erro real se necessário: error_log($e->getMessage());
            $retorno['vencimento'] = null;
        }
    }

    $retorno['valido'] = true;
}

// --- 3. DETEÇÃO DE PIX ---
if (str_starts_with($codigoOriginal, '000201')) {
    $retorno['tipo'] = "PIX Copia e Cola";
    $retorno['valido'] = true;
    // Pix geralmente não tem vencimento/valor fixo na string crua sem parsear o TLV (Tag-Length-Value)
}

echo json_encode($retorno);