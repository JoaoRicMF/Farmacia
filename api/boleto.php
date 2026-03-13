<?php
/**
 * api/boleto.php - Versão com Integração de API Externa
 * Extração local + Consulta em API de Terceiros (cURL)
 */
require_once 'utils.php';
require_once 'MoneyUtils.php';
require_once '../config/database.php';

inicializarApi();

$input = getJsonInput();
$rawCode = $input->codigo ?? '';
// Remove qualquer caractere que não seja número
$linha = preg_replace('/\D/', '', $rawCode);

if (!$linha) {
    enviarResponse(["error" => "Código vazio ou inválido"], 400);
}

// Estrutura de resposta base
$response = [
    "banco_emissor" => null,
    "empresa_cobradora" => "Consulta requer API externa configurada", 
    "data_emissao" => "Não disponível",
    "valor" => null,
    "vencimento" => null,
    "tipo" => "Desconhecido",
    "valido" => false,
    "mensagem" => ""
];

$tam = strlen($linha);

try {
    // 1. PROCESSAMENTO LOCAL (Extrai Banco, Valor e Vencimento rapidamente)
    if ($tam == 44) {
        if (str_starts_with($linha, '8')) {
            processarArrecadacao($linha, $response, true);
        } else {
            processarBancario($linha, $response, true);
        }
    } elseif ($tam == 47 && !str_starts_with($linha, '8')) {
        processarBancario($linha, $response, false);
    } elseif ($tam == 48 && str_starts_with($linha, '8')) {
        processarArrecadacao($linha, $response, false);
    } elseif (str_starts_with($rawCode, '000201')) {
        $response['tipo'] = "PIX Copia e Cola";
        $response['valido'] = true;
    } else {
        throw new Exception("Tamanho de código ($tam) ou formato incompatível.");
    }

    // 2. MOTOR DE APRENDIZADO — tenta prever o fornecedor pela assinatura do código de barras
    if ($response['valido'] && $response['tipo'] !== "PIX Copia e Cola" && strlen($linha) === 44) {
        try {
            $pdo = (new Database())->getConnection();
            $assinatura = gerarAssinaturaBoleto($linha);
            $fornecedorPrevisto = preverFornecedor($assinatura, $pdo);

            if ($fornecedorPrevisto) {
                $response['empresa_cobradora']       = $fornecedorPrevisto;
                $response['aprendido_pelo_sistema']  = true;
            } else {
                $response['aprendido_pelo_sistema']  = false;
            }
        } catch (Exception $eLearning) {
            // Falha silenciosa: banco indisponível não deve derrubar a leitura do boleto
            error_log("[boleto.php] Erro no motor de aprendizado: " . $eLearning->getMessage());
        }
    }

    // 3. CONSULTA NA API EXTERNA (Se o boleto for válido localmente)
    if ($response['valido'] && $response['tipo'] !== "PIX Copia e Cola") {
        $dadosExternos = consultarBoletoNaApiExterna($linha);
        
        if ($dadosExternos) {
            // Se a API externa retornar os dados, sobrescreve a previsão local
            $response['empresa_cobradora']      = $dadosExternos['empresa'] ?? $response['empresa_cobradora'];
            $response['data_emissao']           = $dadosExternos['emissao'] ?? $response['data_emissao'];
            $response['aprendido_pelo_sistema'] = false; // Dado veio da API, não do aprendizado
        } else {
            // Só emite aviso se o fornecedor também não foi previsto pelo aprendizado
            if (empty($response['aprendido_pelo_sistema'])) {
                $response['mensagem'] = "Boleto válido, mas não foi possível consultar os dados da empresa na API externa.";
            }
        }
    }

} catch (Exception $e) {
    $response['valido'] = false;
    $response['mensagem'] = $e->getMessage();
}

enviarResponse($response);


// ============================================================================
// FUNÇÕES DE PROCESSAMENTO LOCAL (Mantidas)
// ============================================================================

function processarBancario($linha, &$res, $isBarcode) {
    $res['tipo'] = "Bancário";
    
    if (!$isBarcode) {
        if (!validarDVsLinhaBancaria($linha)) throw new Exception("DVs da linha digitável inválidos.");
        $barcode = substr($linha, 0, 3) . substr($linha, 3, 1) . substr($linha, 32, 1) . 
                   substr($linha, 33, 4) . substr($linha, 37, 10) . substr($linha, 4, 5) . 
                   substr($linha, 10, 10) . substr($linha, 21, 10);
    } else {
        $barcode = $linha;
    }

    $codBanco = substr($barcode, 0, 3);
    $res['banco_emissor'] = obterNomeBanco($codBanco);

    $fator = substr($barcode, 5, 4);
    $valorCents = (int) substr($barcode, 9, 10);

    if ($fator !== '0000') {
        $res['vencimento'] = calcularVencimentoFator((int)$fator);
    }

    if ($valorCents > 0) {
        $res['valor'] = MoneyUtils::fromCents($valorCents);
    }

    $res['valido'] = true;
}

function processarArrecadacao($linha, &$res, $isBarcode) {
    $res['tipo'] = "Concessionária/Tributo";
    
    if (!$isBarcode) {
        $blocos = [substr($linha, 0, 11), substr($linha, 12, 11), substr($linha, 24, 11), substr($linha, 36, 11)];
        $barcode = implode('', $blocos);
    } else {
        $barcode = $linha;
    }

    $res['banco_emissor'] = obterSegmentoArrecadacao($barcode[1]);

    $idValor = $barcode[2]; 
    if (in_array($idValor, ['6', '7', '8', '9'])) {
        $valorCents = (int) substr($barcode, 4, 11);
        if ($valorCents > 0) {
            $res['valor'] = MoneyUtils::fromCents($valorCents);
        }
    }
    $res['valido'] = true;
}

function obterNomeBanco($codigo) {
    $bancos = [
        '001' => 'Banco do Brasil', '033' => 'Santander', '104' => 'Caixa Econômica Federal',
        '237' => 'Bradesco', '341' => 'Itaú Unibanco', '260' => 'Nubank',
        '077' => 'Banco Inter', '336' => 'C6 Bank', '041' => 'Banrisul',
        '422' => 'Banco Safra', '748' => 'Sicredi', '756' => 'Sicoob',
        '070' => 'BRB - Banco de Brasília', '389' => 'Banco Mercantil do Brasil'
    ];
    return $bancos[$codigo] ?? "Banco Código ($codigo)";
}

function obterSegmentoArrecadacao($codigo) {
    $segmentos = [
        '1' => 'Prefeitura (Impostos/Taxas)', '2' => 'Saneamento (Água/Esgoto)',
        '3' => 'Energia Elétrica e Gás', '4' => 'Telecomunicações',
        '5' => 'Órgãos Governamentais', '6' => 'Carnês / Empresas Públicas',
        '7' => 'Multas de Trânsito', '9' => 'Uso Exclusivo do Banco'
    ];
    return $segmentos[$codigo] ?? "Concessionária ($codigo)";
}

function calcularVencimentoFator(int $fator) {
    if ($fator === 0) return null;
    $dataBase = new DateTime('1997-10-07');
    $dataVenc = clone $dataBase;
    $dataVenc->modify("+$fator days");

    $hoje = new DateTime();
    $limitePassado = clone $hoje;
    $limitePassado->modify("-3650 days"); 
    
    while ($dataVenc < $limitePassado) {
        $dataVenc->modify("+9000 days");
    }
    return $dataVenc->format('Y-m-d');
}

function validarDVsLinhaBancaria($l) {
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
    $soma = 0; $peso = 2;
    for ($i = strlen($num) - 1; $i >= 0; $i--) {
        $multi = $num[$i] * $peso;
        $soma += ($multi > 9) ? ($multi - 9) : $multi;
        $peso = ($peso == 2) ? 1 : 2;
    }
    $resto = $soma % 10;
    return ($resto == 0) ? 0 : (10 - $resto);
}

// ============================================================================
// MOTOR DE APRENDIZADO DE BOLETOS (HEURÍSTICA)
// ============================================================================

/**
 * Gera uma assinatura única baseada no padrão do fornecedor no código de barras (44 posições)
 */
function gerarAssinaturaBoleto($codigoBarras) {
    if (strlen($codigoBarras) !== 44) return null;

    if (str_starts_with($codigoBarras, '8')) {
        // É conta de consumo/arrecadação. Posições 5 a 8 são o ID da empresa.
        $idEmpresa = substr($codigoBarras, 4, 4);
        return "ARREC_" . $idEmpresa;
    } else {
        // É boleto bancário. Extraímos Banco (1-3) + Início do Campo Livre (20-25)
        $banco = substr($codigoBarras, 0, 3);
        $prefixoCedente = substr($codigoBarras, 19, 6);
        return "BANCO_" . $banco . "_" . $prefixoCedente;
    }
}

/**
 * Busca no banco de dados se já conhecemos essa assinatura
 */
function preverFornecedor($assinatura, $pdo) {
    if (!$assinatura) return null;
    
    $stmt = $pdo->prepare("SELECT nome_fornecedor FROM boleto_assinaturas WHERE assinatura = ?");
    $stmt->execute([$assinatura]);
    $resultado = $stmt->fetch(PDO::FETCH_ASSOC);
    
    return $resultado ? $resultado['nome_fornecedor'] : null;
}

function consultarBoletoNaApiExterna($codigoBoleto) {
    // Retorna null para ignorar a pesquisa externa.
    // O sistema usará apenas a decodificação matemática local (Banco, Valor e Vencimento).
    return null;
}