from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

def decifrar_boleto(linha: str | None) -> tuple[str | None, float, str]:
    if not linha: return None, 0.0, ""
    linha = ''.join(filter(str.isdigit, linha))

    try:
        if linha.startswith('8'):
            val = 0.0
            if len(linha) >= 11:
                val_str = linha[4:15]
                val = int(val_str) / 100.0
            return None, val, "Concessionária"
        else:
            if len(linha) == 47:
                fator = linha[33:37]
                val_str = linha[37:]
            elif len(linha) == 44:
                fator = linha[5:9]
                val_str = linha[9:19]
            else:
                return None, 0.0, "Inválido"

            base = datetime(1997, 10, 7)
            dias = int(fator)
            venc = base + timedelta(days=dias)

            while venc < (datetime.now() - timedelta(days=1000)):
                venc += timedelta(days=9000)

            data_formatada = venc.strftime('%Y-%m-%d')
            valor_final = int(val_str) / 100.0

            return data_formatada, valor_final, "Bancário"

    except Exception as e:
        logger.error(f"Erro ao ler boleto: {e}", exc_info=True)
        return None, 0.0, "Erro"