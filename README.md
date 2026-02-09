# 🏥 Farmácia - Sistema de Gestão Financeira e Auditoria

![PHP](https://img.shields.io/badge/PHP-8.1%2B-777BB4?style=for-the-badge&logo=php&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?style=for-the-badge&logo=mysql&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6%2B-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![HTML5](https://img.shields.io/badge/HTML5-Modern-E34F26?style=for-the-badge&logo=html5&logoColor=white)

Sistema robusto de controlo financeiro, fluxo de caixa e auditoria desenvolvido especificamente para a gestão de farmácias. O projeto utiliza uma arquitetura leve com Backend em PHP (API REST) e Frontend em JavaScript puro (Vanilla JS), garantindo desempenho e facilidade de implantação em servidores Apache/Linux padrão.

## 🚀 Funcionalidades Principais

### 📊 Dashboard e Gestão
- **Visão Geral em Tempo Real:** Indicadores de contas a pagar, recebimentos, saldos e alertas de vencimento.
- **Gráficos Interativos:** Evolução mensal de despesas e distribuição por categorias (via *Chart.js*).
- **Calendário Financeiro:** Visualização mensal de vencimentos (via *FullCalendar*).

### 💸 Controlo Financeiro
- **Contas a Pagar/Receber:** CRUD completo de lançamentos financeiros.
- **Leitura Inteligente de Boletos:**
  - Descodificação automática de códigos de barras (Bancários e Concessionárias).
  - Identificação de Pix "Copia e Cola".
  - Preenchimento automático de valor e data de vencimento.
- **Fluxo de Caixa:** Registo de entradas (vendas), sangrias e despesas manuais com verificação de saldo em tempo real.

### 🛡️ Segurança e Auditoria
- **Sistema de Logs:** Rastreio detalhado de todas as ações (quem fez, o quê e quando).
- **Controlo de Acesso:** Níveis de utilizador distintos (**Admin** e **Operador**).
- **Autenticação Segura:** Sessões PHP e hash de passwords (`password_hash`).

### ⚙️ Utilitários
- **Gestão de Fornecedores:** Base de dados para evitar duplicidade de cadastros.
- **Categorização Dinâmica:** Criação e gestão de categorias de despesas (ex: Medicamentos, Água/Luz, Folha).
- **Exportação:** Geração de relatórios em **CSV/Excel** e suporte a impressão PDF nativa.
- **Tema Escuro (Dark Mode):** Interface adaptável para conforto visual.

## 🛠️ Stack Tecnológico

### Backend (API)
- **Linguagem:** PHP 8.1+ (Estruturado, Orientado a Objetos).
- **Base de Dados:** MariaDB / MySQL 8.
- **Segurança:** PDO para prevenção de SQL Injection, Sanitização de Inputs.
- **Roteamento:** `.htaccess` para reescrita de URLs amigáveis.

### Frontend (Interface)
- **Linguagem:** JavaScript (ES6 Modules, Fetch API).
- **Estilo:** CSS3 com Variáveis (CSS Variables) para gestão de temas.
- **Bibliotecas:**
  - `Chart.js` (Gráficos).
  - `FullCalendar` (Agenda).
  - `Lucide` (Ícones Leves).

## 📂 Estrutura do Projeto

```text
├── api/                  # Backend: Lógica de negócio e Endpoints
│   ├── config/           # Configuração de DB e criação automática de tabelas
│   ├── Lib/              # Classes utilitárias (MoneyUtils, etc.)
│   ├── admin.php         # Gestão de utilizadores e logs
│   ├── auth.php          # Autenticação e Sessão
│   ├── boleto.php        # Lógica de leitura de códigos de barras
│   ├── financeiro.php    # CRUD de contas
│   ├── fluxo.php         # Gestão de caixa diário
│   └── ...
├── public/               # Frontend: Interface do utilizador
│   ├── index.html        # SPA (Single Page Application)
│   ├── script.js         # Lógica de interação e chamadas API
│   ├── style.css         # Estilos e temas
│   └── ...
└── .htaccess             # Regras de roteamento do Apache