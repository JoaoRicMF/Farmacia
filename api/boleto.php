<?php
error_reporting(E_ALL);
ini_set('display_errors', 0); // Erros vão para o log, não para o navegador
header("Content-Type: application/json; charset=UTF-8");
session_start();

$data = json_decode(file_get_contents("php://input"));
$linha = preg_replace('/\D/', '', $data->codigo ?? '');

if (!$linha) {
    echo json_encode(["error" => "Código vazio"]);
    exit;
}

$retorno = ["valor" => 0.0, "vencimento" => null, "tipo" => "Desconhecido", "valido" => false];

$tam = strlen($linha);

// 1. BOLETOS DE CONCESSIONÁRIA / TRIBUTOS (48 DÍGITOS)
if (substr($linha, 0, 1) == '8' && ($tam == 48 || $tam == 44)) {
    $retorno['tipo'] = "Concessionária/Tributo";

    /* Em boletos de 48 dígitos, os dígitos nas posições 12, 24, 36 e 48 são verificadores.
       Para ler o valor real, precisamos removê-los para não "sujar" o número.
    */
    if ($tam == 48) {
        $corpo = substr($linha, 0, 11) . substr($linha, 12, 11) . substr($linha, 24, 11) . substr($linha, 36, 11);
    } else {
        $corpo = $linha;
    }

    // O valor em boletos tipo '8' começa na posição 4 (índice 4) e tem 11 dígitos
    $valorStr = substr($corpo, 4, 11);
    $retorno['valor'] = floatval($valorStr) / 100;
    $retorno['valido'] = ($retorno['valor'] > 0);
}

// 2. BOLETOS BANCÁRIOS (47 DÍGITOS)
else if ($tam == 47 || $tam == 44) {
    $retorno['tipo'] = "Bancário";

    $fator = '';
    $valorStr = '';

    if ($tam == 47) {
        // Linha Digitável: Fator (33-37), Valor (37-47)
        $fator = substr($linha, 33, 4);
        $valorStr = substr($linha, 37);
    } else {
        // Código de Barras: Fator (5-9), Valor (9-19)
        $fator = substr($linha, 5, 4);
        $valorStr = substr($linha, 9, 10);
    }

    $retorno['valor'] = floatval($valorStr) / 100;

    if ($fator && $fator != '0000') {
        $dataBase = new DateTime('1997-10-07');
        $dataBase->modify("+{$fator} days");

        /* REGRA DE OURO PARA 2026:
           O fator de vencimento opera em ciclos de 9000 dias.
           O primeiro ciclo terminou em 21/02/2022 (fator 9999 virou 1000).
           Para 2026, qualquer data calculada como menor que 2022 deve ser acrescida de 9000.
        */
        $dataCorte = new DateTime('2022-02-21');
        if ($dataBase < $dataCorte) {
            $dataBase->modify('+9000 days');
        }

        $retorno['vencimento'] = $dataBase->format('Y-m-d');
    }
    $retorno['valido'] = true;
}

// 3. DETECÇÃO DE PIX (Padrão 2026)
if (str_starts_with($data->codigo, '000201')) {
    $retorno['tipo'] = "PIX Copia e Cola";
    // Valores em PIX geralmente exigem um parser de EMV que é mais complexo,
    // mas identificar o tipo já evita que o sistema tente ler como boleto.
}

echo json_encode($retorno);