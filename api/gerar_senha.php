<?php
// Substitua 'sua_senha_aqui' pela senha que você deseja usar no sistema
$senha_pura = 'sua_senha_aqui';
$senha_criptografada = password_hash($senha_pura, PASSWORD_DEFAULT);

echo "Senha Pura: " . $senha_pura . "<br>";
echo "Hash para copiar para o Banco de Dados: <br><strong>" . $senha_criptografada . "</strong>";
