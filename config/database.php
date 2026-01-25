<?php
// config/database.php

class Database {
    // Definição de propriedades com valores padrão (fallback)
    // Prioridade: Variável de Ambiente > Valor Padrão
    private $host;
    private $db_name = "farmacia_db";
    private $username;
    private $password;
    private $port;

    public $conn;

    public function __construct() {
        // Configurações dinâmicas via variáveis de ambiente ou padrões fixos
        $this->host = getenv('DB_HOST') ?: "127.0.0.1";
        $this->username = getenv('DB_USER') ?: "root";
        $this->password = getenv('DB_PASS') ?: "150406"; // Sua senha padrão
        $this->port = getenv('DB_PORT') ?: "3306";       // Porta padrão MySQL/MariaDB
    }

    public function getConnection() {
        $this->conn = null;

        // Monta o DSN (Data Source Name) incluindo a porta e o banco
        $dsn = "mysql:host=" . $this->host . ";port=" . $this->port . ";dbname=" . $this->db_name . ";charset=utf8mb4";

        try {
            // TENTATIVA 1: Conexão direta (Otimizada)
            // Tenta conectar já assumindo que o banco existe.
            $this->conn = new PDO($dsn, $this->username, $this->password);
            $this->conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        } catch(PDOException $exception) {
            // TENTATIVA 2: Auto-instalação (Lazy Initialization)
            // Se o erro for "Unknown database" (código 1049), cria o banco e tabelas.
            if ($exception->getCode() == 1049) {
                $this->configurarPrimeiroAcesso();
            } else {
                // Erros reais de conexão (senha errada, host down, etc.)
                error_log("Erro Crítico de Conexão: " . $exception->getMessage());
                // Retorna null ou lança exceção dependendo de como a API espera tratar
                return null;
            }
        }

        return $this->conn;
    }


    private function configurarPrimeiroAcesso() {
        try {
            // Conecta sem o nome do banco para poder criá-lo
            $dsnSemBanco = "mysql:host=" . $this->host . ";port=" . $this->port . ";charset=utf8mb4";
            $tempConn = new PDO($dsnSemBanco, $this->username, $this->password);
            $tempConn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

            // Cria o banco
            $tempConn->exec("CREATE DATABASE IF NOT EXISTS `" . $this->db_name . "` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;");
            $tempConn->exec("USE `" . $this->db_name . "`;");

            // Define a conexão oficial
            $this->conn = $tempConn;

            // Cria as tabelas
            $this->createTablesIfNotExist();

        } catch (PDOException $e) {
            error_log("Erro ao configurar banco de dados: " . $e->getMessage());
        }
    }

    private function createTablesIfNotExist() {
        if (!$this->conn) return;

        try {
            // Tabela de Usuários
            $this->conn->exec("CREATE TABLE IF NOT EXISTS Usuario (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                usuario VARCHAR(50) NOT NULL UNIQUE,
                senha VARCHAR(255) NOT NULL,
                funcao ENUM('Admin', 'Operador') DEFAULT 'Operador'
            ) ENGINE=InnoDB;");

            // Usuário Admin Padrão
            $checkAdmin = $this->conn->query("SELECT id FROM Usuario LIMIT 1");
            if ($checkAdmin->rowCount() == 0) {
                // Senha 'admin' hashada (recomendado) ou texto puro conforme seu legado
                $this->conn->exec("INSERT INTO Usuario (nome, usuario, senha, funcao) VALUES ('Administrador', 'admin', 'admin', 'Admin')");
            }

            // Tabela Financeiro
            $this->conn->exec("CREATE TABLE IF NOT EXISTS Financeiro (
                id INT AUTO_INCREMENT PRIMARY KEY,
                descricao VARCHAR(255) NOT NULL,
                valor DECIMAL(10, 2) NOT NULL,
                vencimento DATE NOT NULL,
                categoria VARCHAR(100),
                status ENUM('Pendente', 'Pago', 'Vencido', 'Cancelado') DEFAULT 'Pendente',
                codigo_barras VARCHAR(100),
                data_processamento DATETIME DEFAULT NULL
            ) ENGINE=InnoDB;");

            // Tabela de Categorias
            $this->conn->exec("CREATE TABLE IF NOT EXISTS Categorias (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(100) NOT NULL UNIQUE,
                cor VARCHAR(7) DEFAULT '#3b82f6'
            ) ENGINE=InnoDB;");

            // Inserir categorias padrão se a tabela estiver vazia
            $checkCat = $this->conn->query("SELECT id FROM Categorias LIMIT 1");
            if ($checkCat->rowCount() == 0) {
                $padroes = ['Medicamentos (Estoque)', 'Água/Luz/Internet', 'Aluguel & Condomínio', 'Impostos & Taxas', 'Folha de Pagamento'];
                foreach ($padroes as $p) {
                    $this->conn->exec("INSERT INTO Categorias (nome) VALUES ('$p')");
                }
            }

            // Tabela de Fornecedores
            $this->conn->exec("CREATE TABLE IF NOT EXISTS Fornecedor (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(150) NOT NULL,
                cnpj VARCHAR(20), 
                telefone VARCHAR(20),
                categoriaPadrao VARCHAR(100)
            ) ENGINE=InnoDB;");

            // Tabelas de Fluxo de Caixa (Entradas e Saídas)
            $this->conn->exec("CREATE TABLE IF NOT EXISTS EntradaCaixa (
                id_entrada INT AUTO_INCREMENT PRIMARY KEY,
                dataRegistro DATETIME DEFAULT CURRENT_TIMESTAMP,
                formaPagamento VARCHAR(50),
                valor DECIMAL(10, 2) NOT NULL,
                id INT,
                FOREIGN KEY (id) REFERENCES Usuario(id) ON DELETE SET NULL
            ) ENGINE=InnoDB;");

            $this->conn->exec("CREATE TABLE IF NOT EXISTS SaidaCaixa (
                id_saida INT AUTO_INCREMENT PRIMARY KEY,
                dataRegistro DATETIME DEFAULT CURRENT_TIMESTAMP,
                descricao VARCHAR(255),
                valor DECIMAL(10, 2) NOT NULL,
                id INT,
                FOREIGN KEY (id) REFERENCES Usuario(id) ON DELETE SET NULL
            ) ENGINE=InnoDB;");

            // Tabela de Auditoria
            $this->conn->exec("CREATE TABLE IF NOT EXISTS Log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                dataHora DATETIME DEFAULT CURRENT_TIMESTAMP,
                usuario VARCHAR(100),
                acao VARCHAR(100),
                detalhes TEXT
            ) ENGINE=InnoDB;");

        } catch (PDOException $e) {
            error_log("Erro ao criar tabelas: " . $e->getMessage());
        }
    }
}
?>