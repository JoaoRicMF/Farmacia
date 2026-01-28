<?php
// config/database.php
// Garante que erros de configuração não vazem para o output
error_reporting(E_ALL);
ini_set('display_errors', 0);

// Função Global de Auditoria
function registrarLog($db, $usuario, $acao, $detalhes = '') {
    try {
        if (!$db) return;
        $stmt = $db->prepare("INSERT INTO Log (usuario, acao, detalhes) VALUES (:u, :a, :d)");
        $stmt->execute([':u' => $usuario, ':a' => $acao, ':d' => $detalhes]);
    } catch (Exception $e) {
        error_log("Erro Log: " . $e->getMessage());
    }
}

class Database {
    private $host;
    private $db_name = "farmacia_db";
    private $username;
    private $password;
    private $port;
    public $conn;

    public function __construct() {
        // Use variáveis de ambiente ou defina valores fixos aqui
        $this->host = getenv('DB_HOST') ?: "127.0.0.1";
        $this->username = getenv('DB_USER') ?: "root";
        $this->password = getenv('DB_PASS') ?: "150406";
        $this->port = getenv('DB_PORT') ?: "3306";
    }

    public function getConnection() {
        $this->conn = null;
        $dsn = "mysql:host=" . $this->host . ";port=" . $this->port . ";dbname=" . $this->db_name . ";charset=utf8mb4";

        try {
            $this->conn = new PDO($dsn, $this->username, $this->password);
            $this->conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $this->conn->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        } catch(PDOException $exception) {
            // Se erro for banco inexistente (1049), tenta criar
            if ($exception->getCode() == 1049) {
                return $this->configurarPrimeiroAcesso();
            }
            // LANÇA A EXCEÇÃO para ser capturada pelo try-catch da API
            // Não retorna null, pois isso causa erro fatal no dashboard
            throw new Exception("Conexão falhou: " . $exception->getMessage());
        }
        return $this->conn;
    }

    private function configurarPrimeiroAcesso() {
        try {
            $dsnSemBanco = "mysql:host=" . $this->host . ";port=" . $this->port . ";charset=utf8mb4";
            $tempConn = new PDO($dsnSemBanco, $this->username, $this->password);
            $tempConn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

            $tempConn->exec("CREATE DATABASE IF NOT EXISTS `" . $this->db_name . "` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;");
            $tempConn->exec("USE `" . $this->db_name . "`;");

            $this->conn = $tempConn;
            $this->createTablesIfNotExist();
            return $this->conn;
        } catch (PDOException $e) {
            error_log("Erro Setup: " . $e->getMessage());
            throw new Exception("Erro fatal ao criar banco de dados.");
        }
    }

    private function createTablesIfNotExist() {
        if (!$this->conn) return;

        try {
            // Tabela Usuario
            $this->conn->exec("CREATE TABLE IF NOT EXISTS Usuario (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                usuario VARCHAR(50) NOT NULL UNIQUE,
                senha VARCHAR(255) NOT NULL,
                funcao ENUM('Admin', 'Operador') DEFAULT 'Operador'
            ) ENGINE=InnoDB;");

            // Admin Padrão com Hash Seguro
            $check = $this->conn->query("SELECT id FROM Usuario LIMIT 1");
            if ($check->rowCount() == 0) {
                $senhaHash = password_hash('admin', PASSWORD_DEFAULT);
                $stmt = $this->conn->prepare("INSERT INTO Usuario (nome, usuario, senha, funcao) VALUES ('Administrador', 'admin', :senha, 'Admin')");
                $stmt->execute([':senha' => $senhaHash]);
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

            // Tabela Categorias
            $this->conn->exec("CREATE TABLE IF NOT EXISTS Categorias (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(100) NOT NULL UNIQUE,
                cor VARCHAR(7) DEFAULT '#3b82f6'
            ) ENGINE=InnoDB;");

            // Categorias Padrão
            $checkCat = $this->conn->query("SELECT id FROM Categorias LIMIT 1");
            if ($checkCat->rowCount() == 0) {
                $padroes = ['Medicamentos (Estoque)', 'Água/Luz/Internet', 'Aluguel & Condomínio', 'Impostos & Taxas', 'Folha de Pagamento', 'Marketing', 'Manutenção', 'Outros'];
                foreach ($padroes as $p) {
                    $this->conn->exec("INSERT INTO Categorias (nome) VALUES ('$p')");
                }
            }

            // Tabela Fornecedor
            $this->conn->exec("CREATE TABLE IF NOT EXISTS Fornecedor (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(150) NOT NULL,
                cnpj VARCHAR(20), 
                telefone VARCHAR(20),
                categoriaPadrao VARCHAR(100)
            ) ENGINE=InnoDB;");

            // Tabelas de Fluxo
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

            // Tabela Log
            $this->conn->exec("CREATE TABLE IF NOT EXISTS Log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                dataHora DATETIME DEFAULT CURRENT_TIMESTAMP,
                usuario VARCHAR(100),
                acao VARCHAR(100),
                detalhes TEXT
            ) ENGINE=InnoDB;");

        } catch (PDOException $e) {
            error_log("Erro tables: " . $e->getMessage());
        }
    }
}