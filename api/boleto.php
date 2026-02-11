<?php
/**
 * api/boleto.php - Versão Refatorada (Sênior)
 * Especialista em Validação FEBRABAN
 */
require_once 'utils.php';
require_once 'MoneyUtils.php';

inicializarApi();

$input = getJsonInput();
$rawCode = $input->codigo ?? '';
// Remove qualquer caractere que não seja número
$linha = preg_replace('/\D/', '', $rawCode);

if (!$linha) {
    enviarResponse(["error" => "Código vazio ou inválido"], 400);
}

$response = [
    "valor" => null,
    "vencimento" => null,
    "tipo" => "Desconhecido",
    "valido" => false,
    "mensagem" => ""
];

$tam = strlen($linha);

try {
    // 1. IDENTIFICAÇÃO DO TIPO E PROCESSAMENTO
    if ($tam == 44) {
        // Formato: Código de Barras
        if (str_starts_with($linha, '8')) {
            processarArrecadacao($linha, $response, true);
        } else {
            processarBancario($linha, $response, true);
        }
    } elseif ($tam == 47 && !str_starts_with($linha, '8')) {
        // Formato: Linha Digitável Bancária
        processarBancario($linha, $response, false);
    } elseif ($tam == 48 && str_starts_with($linha, '8')) {
        // Formato: Linha Digitável Arrecadação
        processarArrecadacao($linha, $response, false);
    } elseif (str_starts_with($rawCode, '000201')) {
        // Formato: PIX (EMV)
        $response['tipo'] = "PIX Copia e Cola";
        $response['valido'] = true;
    } else {
        throw new Exception("Tamanho de código ($tam) ou formato incompatível.");
    }

} catch (Exception $e) {
    $response['valido'] = false;
    $response['mensagem'] = $e->getMessage();
}

enviarResponse($response);

// --- FUNÇÕES DE PROCESSAMENTO ---

/**
 * Processa Boletos Bancários (Título de Cobrança)
 */
function processarBancario($linha, &$res, $isBarcode) {
    $res['tipo'] = "Bancário";
    
    // Se for linha digitável, converte para a estrutura de barcode para extração única
    if (!$isBarcode) {
        // Validação de DVs dos campos (Obrigatório para segurança)
        if (!validarDVsLinhaBancaria($linha)) throw new Exception("DVs da linha digitável inválidos.");
        
        // Reconstrói o código de barras (44 dígitos) a partir da linha
        $barcode = substr($linha, 0, 3) . substr($linha, 3, 1) . substr($linha, 32, 1) . 
                   substr($linha, 33, 4) . substr($linha, 37, 10) . substr($linha, 4, 5) . 
                   substr($linha, 10, 10) . substr($linha, 21, 10);
    } else {
        $barcode = $linha;
    }

    // Extração de Dados baseada no Código de Barras (44 dígitos)
    // Fator: pos 5-8 (índice 5, tam 4) | Valor: pos 9-18 (índice 9, tam 10)
    $fator = substr($barcode, 5, 4);
    $valorCents = (int) substr($barcode, 9, 10);

    // Vencimento: Fator 0000 significa vencimento em aberto
    if ($fator !== '0000') {
        $res['vencimento'] = calcularVencimentoFator((int)$fator);
    }

    // Valor: 0 significa valor em aberto (preenchimento manual no banco)
    if ($valorCents > 0) {
        $res['valor'] = MoneyUtils::fromCents($valorCents);
    }

    $res['valido'] = true;
}

/**
 * Processa Boletos de Arrecadação (Concessionárias, Tributos)
 */
function processarArrecadacao($linha, &$res, $isBarcode) {
    $res['tipo'] = "Concessionária/Tributo";
    
    // Extração do corpo (sem DVs)
    if (!$isBarcode) {
        $blocos = [substr($linha, 0, 11), substr($linha, 12, 11), substr($linha, 24, 11), substr($linha, 36, 11)];
        $barcode = implode('', $blocos);
    } else {
        $barcode = $linha;
    }

    // No padrão arrecadação, o dígito 3 indica se o valor está presente
    // e qual o critério de cálculo do DV
    $idValor = $barcode[2]; 
    
    // Conforme FEBRABAN, se o ID de valor for 6, 7, 8 ou 9, o valor está nas posições 4-14 (corpo)
    if (in_array($idValor, ['6', '7', '8', '9'])) {
        $valorCents = (int) substr($barcode, 4, 11);
        if ($valorCents > 0) {
            $res['valor'] = MoneyUtils::fromCents($valorCents);
        }
    }

    // Arrecadação não tem fator de vencimento padrão. 
    // Algumas prefeituras usam YYYYMMDD em posições específicas, mas não é universal.
    $res['valido'] = true;
}

// --- UTILITÁRIOS DE CÁLCULO ---

/**
 * Cálculo do fator de vencimento (Padrão FEBRABAN 2025+)
 */
function calcularVencimentoFator(int $fator) {
    if ($fator === 0) return null;

    $dataBase = new DateTime('1997-10-07');
    $hoje = new DateTime();
    
    // Regra do Overflow (2025): Se o fator for menor que 1000 e estamos em 2025+, 
    // ele pertence ao novo ciclo (adiciona-se 9000 ao fator para o cálculo temporal)
    if ($hoje->format('Y') >= 2025 && $fator < 1000) {
        $fator += 9000;
    }
    
    // Caso especial: entre 2025 e o final do ciclo, fatores baixos são do novo ciclo
    // Se a data base + fator for muito antiga (ex: 2000), adicionamos 9000 dias.
    $dataVenc = clone $dataBase;
    $dataVenc->modify("+$fator days");

    // Janela deslizante: se o vencimento calculado for mais de 15 anos atrás, 
    // assume-se o próximo ciclo de 9000 dias.
    $intervalo = $hoje->diff($dataVenc);
    if ($intervalo->y > 15 && $dataVenc < $hoje) {
        $dataVenc->modify("+9000 days");
    }

    return $dataVenc->format('Y-m-d');
}

/**
 * Validação básica de Modulo 10 (Usado nos campos da linha digitável)
 */
function validarDVsLinhaBancaria($l) {
    // Valida os 3 primeiros campos
    $campos = [
        ['num' => substr($l, 0, 9), 'dv' => $l[9]],
        ['num' => substr($l, 10, 10), 'dv' => $l[20]],
        ['num' => substr($l, 21, 10), 'dv' => $l[31]]
    ];

    foreach ($campos as $c) {
        if (modulo10($c['num']) != $c['dv']) return false;
    }
    return true;
}

function modulo10($num) {
    $soma = 0;
    $peso = 2;
    for ($i = strlen($num) - 1; $i >= 0; $i--) {
        $multi = $num[$i] * $peso;
        $soma += ($multi > 9) ? ($multi - 9) : $multi;
        $peso = ($peso == 2) ? 1 : 2;
    }
    $resto = $soma % 10;
    return ($resto == 0) ? 0 : (10 - $resto);
}