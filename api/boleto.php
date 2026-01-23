<?php
header("Content-Type: application/json");
session_start();

$data = json_decode(file_get_contents("php://input"));
$linha = preg_replace('/\D/', '', $data->codigo ?? '');

if (!$linha) {
    echo json_encode(["error" => "Código vazio"]);
    exit;
}

$retorno = ["valor" => 0.0, "vencimento" => null, "tipo" => "Desconhecido"];

// Lógica básica de decodificação (simplificada)
if (substr($linha, 0, 1) == '8') {
    // Concessionária (Água, Luz, Tel)
    $retorno['tipo'] = "Concessionária";
    if (strlen($linha) >= 11) {
        $valorStr = substr($linha, 4, 11);
        $retorno['valor'] = floatval($valorStr) / 100;
    }
} else {
    // Bancário
    $retorno['tipo'] = "Bancário";

    $fator = '';
    $valorStr = '';

    if (strlen($linha) == 47) { // Linha digitável
        $fator = substr($linha, 33, 4);
        $valorStr = substr($linha, 37);
    } elseif (strlen($linha) == 44) { // Código de barras
        $fator = substr($linha, 5, 4);
        $valorStr = substr($linha, 9, 10);
    }

    if ($valorStr) {
        $retorno['valor'] = floatval($valorStr) / 100;
    }

    if ($fator) {
        // Cálculo do fator de vencimento (Base: 07/10/1997)
        $base = new DateTime('1997-10-07');
        $base->modify("+{$fator} days");

        // Ajuste para datas antigas (loop de 9000 dias)
        $hojeMenos1000 = new DateTime();
        $hojeMenos1000->modify('-1000 days');

        while ($base < $hojeMenos1000) {
            $base->modify('+9000 days');
        }

        $retorno['vencimento'] = $base->format('Y-m-d');
    }
}

echo json_encode($retorno);
?>