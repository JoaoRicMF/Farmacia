package com.farmacia.controller;

import com.farmacia.model.Log;
import com.farmacia.model.Usuario;
import com.farmacia.service.UsuarioService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
public class AuthController {

    @Autowired private UsuarioService usuarioService;

    // DTO para login
    record LoginRequest(String usuario, String senha) {}

    @PostMapping("/api/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest loginRequest, HttpSession session) {
        Usuario user = usuarioService.verificarLogin(loginRequest.usuario, loginRequest.senha);

        if (user != null) {
            // Cria a sessão como no Python: session['usuario'] = ...
            session.setAttribute("usuario", user.getNome());
            session.setAttribute("funcao", user.getFuncao());

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("nome", user.getNome());
            response.put("funcao", user.getFuncao());
            return ResponseEntity.ok(response);
        }

        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("success", false, "message", "Credenciais inválidas"));
    }

    @PostMapping("/api/logout")
    public ResponseEntity<?> logout(HttpSession session) {
        session.invalidate();
        return ResponseEntity.ok(Map.of("success", true));
    }

    @GetMapping("/api/dados_usuario")
    public ResponseEntity<?> dadosUsuario(HttpSession session) {
        String nome = (String) session.getAttribute("usuario");
        if (nome == null) return ResponseEntity.ok(Map.of()); // JSON Vazio

        // No Python ele busca no banco de novo, mas podemos retornar da sessão ou chamar service
        return ResponseEntity.ok(Map.of("login", "...", "nome", nome));
    }

    @GetMapping("/api/logs")
    public ResponseEntity<?> logs(HttpSession session) {
        String funcao = (String) session.getAttribute("funcao");
        if (!"Admin".equals(funcao)) return ResponseEntity.status(403).build();

        List<Log> logs = usuarioService.listarLogs();
        return ResponseEntity.ok(logs);
    }

    // Outros métodos de admin (criar_usuario, reset_senha) seguem a mesma lógica...
}