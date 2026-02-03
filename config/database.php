<?php
// config/database.php
error_reporting(E_ALL);
ini_set('display_errors', 0);

/**
 * Função Global de Auditoria
 */
function registrarLog(?PDO $db, string $usuario, string $acao, string $detalhes = ''): void {
    if (!$db) return;

    try {
        $stmt = $db->prepare("INSERT INTO Log (usuario, acao, detalhes) VALUES (:u, :a, :d)");
        $stmt->execute([':u' => $usuario, ':a' => $acao, ':d' => $detalhes]);
    } catch (Exception $e) {
        // Loga no arquivo do servidor, sem parar a aplicação
        error_log("Erro ao gravar Log de Auditoria: " . $e->getMessage());
    }
}

class Database {
    private string $host;
    private string $db_name = "farmacia_db";
    private string $username;
    private string $password;
    private string $port;

    public ?PDO $conn = null;

    public function __construct() {
        $this->host     = getenv('DB_HOST') ?: "127.0.0.1";
        $this->username = getenv('DB_USER') ?: "root";
        $this->password = getenv('DB_PASS') ?: "1504";
        $this->port     = getenv('DB_PORT') ?: "3306";
    }

    /**
     * @return PDO
     * @throws Exception Caso a conexão falhe irremediavelmente
     */
    public function getConnection(): PDO {
        $this->conn = null;

        $dsn = "mysql:host=" . $this->host . ";port=" . $this->port . ";dbname=" . $this->db_name . ";charset=utf8mb4";

        try {
            $this->conn = new PDO($dsn, $this->username, $this->password);
            $this->conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $this->conn->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

        } catch (PDOException $exception) {
            // Se o erro for "Unknown Database" (Código 1049), tenta criar o banco
            if ($exception->getCode() == 1049) {
                return $this->configurarPrimeiroAcesso();
            }

            // Loga o erro real no servidor
            error_log("DB Connect Error: " . $exception->getMessage());

            // Lança uma nova exceção genérica para a API capturar (sem expor detalhes sensíveis)
            throw new Exception("Falha na conexão com o banco de dados.");
        }

        return $this->conn;
    }

    /**
     * Cria banco e tabelas.
     * @throws Exception Se não for possível criar o banco.
     */
    private function configurarPrimeiroAcesso(): PDO {
        try {
            // Conecta sem selecionar DB
            $dsnSemBanco = "mysql:host=" . $this->host . ";port=" . $this->port . ";charset=utf8mb4";
            $tempConn = new PDO($dsnSemBanco, $this->username, $this->password);
            $tempConn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

            // Cria o Banco
            $tempConn->exec("CREATE DATABASE IF NOT EXISTS `" . $this->db_name . "` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;");
            $tempConn->exec("USE `" . $this->db_name . "`;");

            // Define como conexão oficial
            $this->conn = $tempConn;

            // Cria tabelas
            $this->createTablesIfNotExist();

            return $this->conn;

        } catch (PDOException $e) {
            error_log("Erro Fatal Setup: " . $e->getMessage());
            // Aqui é a linha 98 (original): Lança a exceção para quem chamou o getConnection tratar
            throw new Exception("Erro fatal: Não foi possível criar o banco de dados inicial.");
        }
    }

    private function createTablesIfNotExist(): void {
        if (!$this->conn) return;

        try {
            // 1. Tabela Usuario
            $this->conn->exec("CREATE TABLE IF NOT EXISTS Usuario (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                usuario VARCHAR(50) NOT NULL UNIQUE,
                senha VARCHAR(255) NOT NULL,
                funcao ENUM('Admin', 'Operador') DEFAULT 'Operador'
            ) ENGINE=InnoDB;");

            // Admin Padrão
            $check = $this->conn->query("SELECT id FROM Usuario LIMIT 1");
            if ($check->rowCount() == 0) {
                $senhaHash = password_hash('admin', PASSWORD_DEFAULT);
                $stmt = $this->conn->prepare("INSERT INTO Usuario (nome, usuario, senha, funcao) VALUES ('Administrador', 'admin', :senha, 'Admin')");
                $stmt->execute([':senha' => $senhaHash]);
            }

            // 2. Financeiro
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

            // 3. Categorias
            $this->conn->exec("CREATE TABLE IF NOT EXISTS Categorias (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(100) NOT NULL UNIQUE,
                cor VARCHAR(7) DEFAULT '#3b82f6'
            ) ENGINE=InnoDB;");

            // Categorias Padrão
            // CORREÇÃO LINHA 158: Usamos INSERT IGNORE para evitar o try-catch vazio
            $checkCat = $this->conn->query("SELECT id FROM Categorias LIMIT 1");
            if ($checkCat->rowCount() == 0) {
                $padroes = ['Medicamentos (Estoque)', 'Água/Luz/Internet', 'Aluguel & Condomínio', 'Impostos & Taxas', 'Folha de Pagamento', 'Marketing', 'Manutenção', 'Outros'];

                // INSERT IGNORE faz o MySQL ignorar silenciosamente se a chave UNIQUE (nome) já existir
                $stmtCat = $this->conn->prepare("INSERT IGNORE INTO Categorias (nome) VALUES (:nome)");

                foreach ($padroes as $p) {
                    $stmtCat->execute([':nome' => $p]);
                }
            }

            // 4. Fornecedor
            $this->conn->exec("CREATE TABLE IF NOT EXISTS Fornecedor (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(150) NOT NULL,
                cnpj VARCHAR(20), 
                telefone VARCHAR(20),
                categoriaPadrao VARCHAR(100)
            ) ENGINE=InnoDB;");

            // 5. Fluxo
            $this->conn->exec("CREATE TABLE IF NOT EXISTS EntradaCaixa (
                id_entrada INT AUTO_INCREMENT PRIMARY KEY,
                dataRegistro DATETIME DEFAULT CURRENT_TIMESTAMP,
                formaPagamento VARCHAR(50),
                descricao VARCHAR(255), -- Adicione esta linha
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

            // 6. Log
            $this->conn->exec("CREATE TABLE IF NOT EXISTS Log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                dataHora DATETIME DEFAULT CURRENT_TIMESTAMP,
                usuario VARCHAR(100),
                acao VARCHAR(100),
                detalhes TEXT
            ) ENGINE=InnoDB;");

        } catch (PDOException $e) {
            error_log("Erro na criação de tabelas: " . $e->getMessage());
        }
    }
}