<?php
// api/Lib/MoneyUtils.php

class MoneyUtils {
    /**
     * Converte um valor decimal (DB/String) para Inteiro (Centavos).
     * Ex: 10.50 -> 1050
     */
    public static function toCents(float|string $value): int {
        if (is_string($value)) {
            // Remove R$, espaços e troca vírgula por ponto se necessário
            $value = str_replace(['R$', ' ', ','], ['', '', '.'], $value);
        }
        // round() previne erros de conversão do float binário
        return (int) round(((float) $value) * 100);
    }

    /**
     * Converte Centavos (Int) para Float (para JSON/DB).
     * Ex: 1050 -> 10.50
     */
    public static function fromCents(int $cents): float {
        return round($cents / 100, 2);
    }

    /**
     * Formata Centavos para String legível.
     * Ex: 1050 -> "10.50"
     */
    public static function format(int $cents): string {
        return number_format($cents / 100, 2, '.', '');
    }
}