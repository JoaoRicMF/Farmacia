<?php
// config/database.php

class Database {
    private $host = "localhost";
    private $db_name = "farmacia_db";
    private $username = "root";
    private $password = "sua_senha"; // Lembre-se de configurar a senha correta do seu MySQL
    public $conn;

    public function getConnection() {
        $this->conn = null;
        try {
            $this->conn = new PDO("mysql:host=" . $this->host . ";dbname=" . $this->db_name, $this->username, $this->password);
            $this->conn->exec("set names utf8");
            $this->conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        } catch(PDOException $exception) {
            // Correção: Não dar echo aqui para não quebrar o JSON das APIs
            error_log("Erro de conexão: " . $exception->getMessage());
        }
        return $this->conn;
    }
}
?>