# 🏥 Farmácia - Sistema Financeiro

Sistema de gestão financeira completo desenvolvido em Python com Flask, focado no controle de contas a pagar, fluxo de caixa e auditoria para farmácias.

O sistema foi projetado para ser **híbrido**: roda leve localmente com **SQLite** e escala automaticamente para **PostgreSQL** em produção.

## 🚀 Funcionalidades

- **Dashboard Interativo**: Gráficos de despesas mensais (Chart.js), divisão por categorias e indicadores de vencimento.
- **Fluxo de Caixa Otimizado**: Entradas e saídas com cálculo de saldo em tempo real (Agregações via SQL).
- **Leitura de Boletos**: Decodificação inteligente de linha digitável e código de barras (Bancário e Concessionárias).
- **Calendário Visual**: Visualização de vencimentos integrada (FullCalendar).
- **Auditoria (Logs)**: Rastreamento completo de ações dos usuários (quem fez o quê e quando).
- **Relatórios**: Exportação de dados para Excel (.xlsx) e CSV.
- **Segurança**: Login criptografado (SHA-256) e controle de permissões (Admin vs Operador).

## 🛠️ Tecnologias Utilizadas

- **Backend**: Python 3.14, Flask, SQLAlchemy.
- **Banco de Dados**:
   - *Desenvolvimento*: SQLite (Automático).
   - *Produção*: PostgreSQL (Via variável de ambiente).
- **Frontend**: HTML5, CSS3 (Responsivo + Dark Mode), JavaScript Puro.
- **Servidor**: Gunicorn (Para deploy em produção).

## 📦 Como Rodar Localmente

1. **Clone o repositório**
   ```bash
   git clone [https://github.com/seu-usuario/farmacia-financeiro.git](https://github.com/seu-usuario/farmacia-financeiro.git)
   cd farmacia-financeiro
