# 🏥 Farmácia - Sistema Financeiro (Spring Boot Edition)

Sistema de gestão financeira completo, originalmente concebido em Python e **migrado para Java com Spring Boot**, focado no controlo de contas a pagar, fluxo de caixa e auditoria para farmácias.

O sistema foi modernizado para arquitetura **MVC** com **Spring Data JPA** e **MySQL**, pronto para execução em containers Docker.

## 🚀 Funcionalidades

- **Dashboard Interativo**: Gráficos de despesas mensais, divisão por categorias e indicadores de vencimento.
- **Fluxo de Caixa Otimizado**: Entradas e saídas com cálculo de saldo em tempo real.
- **Leitura de Boletos**: Decodificação de linha digitável e código de barras.
- **Calendário Visual**: Visualização de vencimentos (integração FullCalendar).
- **Auditoria (Logs)**: Rastreio completo de ações dos utilizadores (quem fez o quê e quando).
- **Relatórios**: Exportação de dados para Excel (.xlsx) usando Apache POI.
- **Segurança**: Autenticação customizada com BCrypt e Sessão HTTP.

## 🛠️ Tecnologias Utilizadas

- **Backend**: Java 17, Spring Boot 3.2.2.
- **Base de Dados**: MySQL 8.0 (JPA / Hibernate).
- **Build Tool**: Maven.
- **Frontend**: HTML5, CSS3, JavaScript Vanilla (servidos via recursos estáticos do Spring).
- **Infraestrutura**: Docker (Dockerfile incluído).

## 📦 Como Rodar Localmente (Via Maven)

Pré-requisitos: Java JDK 17, Maven e MySQL instalado.

1. **Configurar a Base de Dados**
   Crie um esquema no MySQL chamado `farmacia_db` e ajuste as credenciais no ficheiro `routes/src/main/resources/application.properties` (ou use variáveis de ambiente).

2. **Compilar e Executar**
   Navegue até à pasta do projeto Java:
   ```bash
   cd routes
   mvn spring-boot:run