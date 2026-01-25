<?php
// config/database.php

class Database {
    private $host = "127.0.0.1"; // Alterado de localhost para 127.0.0.1 para evitar conflitos de socket
    private $db_name = "farmacia_db";
    private $username = "root";
    private $password = "150406"; // Certifique-se que a senha do usuário root no MariaDB é a mesma
    public $conn;

    public function getConnection() {
        $this->conn = null;
        try {
            // Se o MariaDB estiver em porta diferente, adicione ";port=XXXX" ao DSN
            $this->conn = new PDO("mysql:host=" . $this->host, $this->username, $this->password);
            $this->conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

            // 2. Cria o banco de dados se não existir
            $this->conn->exec("CREATE DATABASE IF NOT EXISTS `$this->db_name` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;");

            // 3. Seleciona o banco de dados
            $this->conn->exec("USE `$this->db_name`;");
            $this->conn->exec("set names utf8mb4");

            // 4. Verifica e cria as tabelas automaticamente
            $this->createTablesIfNotExist();

        } catch(PDOException $exception) {
            error_log("Erro de conexão/setup: " . $exception->getMessage());
        }
        return $this->conn;
    }

    private function createTablesIfNotExist() {
        // Tabela de Usuários (necessária para login)
        $this->conn->exec("CREATE TABLE IF NOT EXISTS Usuario (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100) NOT NULL,
            usuario VARCHAR(50) NOT NULL UNIQUE,
            senha VARCHAR(255) NOT NULL,
            funcao ENUM('Admin', 'Operador') DEFAULT 'Operador'
        ) ENGINE=InnoDB;");

        // Cria um admin padrão caso a tabela esteja vazia
        $checkAdmin = $this->conn->query("SELECT id FROM Usuario LIMIT 1");
        if ($checkAdmin->rowCount() == 0) {
            $this->conn->exec("INSERT INTO Usuario (nome, usuario, senha, funcao) VALUES ('Administrador', 'admin', 'admin', 'Admin')");
        }

        // Tabela Financeiro (registros de boletos)
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

        // Tabela de Fornecedores
        $this->conn->exec("CREATE TABLE IF NOT EXISTS Fornecedor (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(150) NOT NULL,
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
    }
}
?>