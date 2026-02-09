# 🏥 Farmácia - Sistema de Gestão Financeira

![Java](https://img.shields.io/badge/Java-17%2B-orange?style=for-the-badge&logo=openjdk)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-3.2.2-brightgreen?style=for-the-badge&logo=springboot)
![MySQL](https://img.shields.io/badge/MySQL-8.0-blue?style=for-the-badge&logo=mysql)
![PHP](https://img.shields.io/badge/PHP-8.1-777BB4?style=for-the-badge&logo=php)

Sistema robusto de controlo financeiro e auditoria para farmácias. Originalmente concebido para ambientes PHP/Apache, o núcleo do sistema foi migrado para **Spring Boot (Java)**, oferecendo maior escalabilidade e segurança.

## 🚀 Funcionalidades

- **📈 Dashboard em Tempo Real**: Indicadores de contas a pagar, vencidos e próximos vencimentos com gráficos interativos (Chart.js).
- **💸 Fluxo de Caixa**: Gestão de entradas (vendas) e saídas (sangrias/despesas) com cálculo automático de saldo líquido.
- **📄 Leitura de Boletos**: Descodificação inteligente de linha digitável e códigos de barras bancários e de concessionárias.
- **🛡️ Auditoria Completa**: Rastreio de ações de utilizadores (Logs) para garantir a integridade dos dados.
- **📅 Calendário Visual**: Visualização mensal de compromissos financeiros integrada com FullCalendar.
- **📊 Exportação de Dados**: Geração de relatórios em formato CSV/Excel para análise externa.

## 🛠️ Tecnologias Utilizadas

### Backend
- **Java 17 & Spring Boot 3**: Arquitetura moderna e segura.
- **PHP 8**: Utilizado para módulos legados e APIs utilitárias.
- **Spring Data JPA**: Abstração de persistência de dados.
- **MySQL 8**: Base de dados relacional fiável.

### Frontend
- **Interface**: HTML5, CSS3 (Modern UI com suporte a Tema Escuro).
- **Componentes**: JavaScript Vanilla, Lucide Icons e Chart.js.

## 📂 Estrutura do Projeto

```text
├── api/                # Endpoints PHP para lógica de negócio legada
├── config/             # Configurações de base de dados e auditoria
├── public/             # Interface web (HTML, CSS, JS)
└── routes/             # Núcleo da aplicação Spring Boot (Java)