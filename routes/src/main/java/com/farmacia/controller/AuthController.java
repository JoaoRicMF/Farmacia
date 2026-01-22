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

    // DTOs
    record LoginRequest(String usuario, String senha) {}
    record UserRequest(String nome, String usuario, String senha, String funcao) {}
    record PasswordResetRequest(Integer id, String nova_senha) {}
    record ProfileRequest(String novo_nome, String novo_login, String nova_senha) {}

    // --- LOGIN / LOGOUT ---

    @PostMapping("/api/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest req, HttpSession session) {
        Usuario user = usuarioService.verificarLogin(req.usuario, req.senha);
        if (user != null) {
            session.setAttribute("usuario", user.getUsuario()); // Guardar o login é mais seguro para buscas
            session.setAttribute("nome", user.getNome());
            session.setAttribute("funcao", user.getFuncao());

            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "nome", user.getNome(),
                    "funcao", user.getFuncao()
            ));
        }
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false, "message", "Credenciais inválidas"));
    }

    @PostMapping("/api/logout")
    public ResponseEntity<?> logout(HttpSession session) {
        session.invalidate();
        return ResponseEntity.ok(Map.of("success", true));
    }

    @GetMapping("/api/dados_usuario")
    public ResponseEntity<?> dadosUsuario(HttpSession session) {
        String login = (String) session.getAttribute("usuario");
        String nome = (String) session.getAttribute("nome");

        if (login == null) return ResponseEntity.ok(Map.of());
        return ResponseEntity.ok(Map.of("login", login, "nome", nome));
    }

    // --- ADMINISTRAÇÃO ---

    @GetMapping("/api/logs")
    public ResponseEntity<?> logs(HttpSession session) {
        if (!"Admin".equals(session.getAttribute("funcao"))) return ResponseEntity.status(403).build();
        return ResponseEntity.ok(usuarioService.listarLogs());
    }

    @GetMapping("/api/lista_usuarios")
    public ResponseEntity<?> listarUsuarios(HttpSession session) {
        if (!"Admin".equals(session.getAttribute("funcao"))) return ResponseEntity.status(403).build();
        return ResponseEntity.ok(usuarioService.listarTodos());
    }

    @PostMapping("/api/criar_usuario")
    public ResponseEntity<?> criarUsuario(@RequestBody UserRequest req, HttpSession session) {
        if (!"Admin".equals(session.getAttribute("funcao"))) return ResponseEntity.status(403).build();
        String adminLog = (String) session.getAttribute("usuario");

        try {
            // Agora passando 5 argumentos conforme o Service atualizado
            usuarioService.criarUsuario(adminLog, req.nome, req.usuario, req.senha, req.funcao);
            return ResponseEntity.ok(Map.of("success", true, "message", "Usuário criado!"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    @PostMapping("/api/admin_reset_senha")
    public ResponseEntity<?> resetSenha(@RequestBody PasswordResetRequest req, HttpSession session) {
        if (!"Admin".equals(session.getAttribute("funcao"))) return ResponseEntity.status(403).build();
        String adminLog = (String) session.getAttribute("usuario");

        // Chama o método específico que aceita ID (Integer)
        usuarioService.alterarSenhaPorId(adminLog, req.id, req.nova_senha);
        return ResponseEntity.ok(Map.of("success", true, "message", "Senha alterada."));
    }

    // --- PERFIL ---

    @PostMapping("/api/alterar_perfil")
    public ResponseEntity<?> alterarPerfil(@RequestBody ProfileRequest req, HttpSession session) {
        String usuarioAtual = (String) session.getAttribute("usuario");
        if (usuarioAtual == null) return ResponseEntity.status(403).build();

        boolean sucesso = usuarioService.atualizarPerfil(usuarioAtual, req.novo_nome, req.novo_login, req.nova_senha);

        if (sucesso) {
            // Atualiza sessão se mudou o nome/login
            session.setAttribute("usuario", req.novo_login);
            session.setAttribute("nome", req.novo_nome);
            return ResponseEntity.ok(Map.of("success", true));
        }
        return ResponseEntity.badRequest().body(Map.of("success", false));
    }
}