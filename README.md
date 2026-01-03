# 🏥 Sistema Financeiro Farmácia

Sistema de gestão financeira desenvolvido em Python com Streamlit, focado no controle de contas a pagar (boletos), fluxo de caixa e organização de despesas de uma farmácia.

## 🚀 Funcionalidades

- **Dashboard Interativo**: Visualização gráfica de despesas por mês e métricas de contas pagas/pendentes.
- **Leitura de Boletos**: Decodificação automática de linha digitável e código de barras com correção para o ciclo de vencimento (pós-2025).
- **Gestão de Pagamentos**: Controle de status (Pendente/Pago) e exclusão segura de registros.
- **Importação/Exportação**: Suporte a arquivos Excel (.xlsx) e exportação de relatórios em CSV.
- **Banco de Dados**: Armazenamento local seguro utilizando SQLite + SQLAlchemy.

## 🛠️ Tecnologias Utilizadas

- **Interface**: [Streamlit](https://streamlit.io/)
- **Linguagem**: Python 3.14
- **Manipulação de Dados**: Pandas
- **Banco de Dados**: SQLite & SQLAlchemy

## 📦 Como Rodar o Projeto

1. **Clone o repositório**
   ```bash
   git clone [https://github.com/seu-usuario/farmacia-financeiro.git](https://github.com/seu-usuario/farmacia-financeiro.git)
   cd farmacia-financeiro
