package com.farmacia.controller;

import com.farmacia.model.Usuario;
import com.farmacia.repository.UsuarioRepository;
import com.farmacia.service.UsuarioService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
public class AuthController {

    @Autowired private AuthenticationManager authenticationManager;
    @Autowired private UsuarioService usuarioService;
    @Autowired private UsuarioRepository usuarioRepository;

    // --- DTOs (Estes estavam faltando!) ---
    record LoginRequest(String usuario, String senha) {}
    record UserRequest(String nome, String usuario, String senha, String funcao) {}
    record PasswordResetRequest(Integer id, String nova_senha) {}
    record ProfileRequest(String novo_nome, String novo_login, String nova_senha) {}

    // --- MÉTODOS AUXILIARES ---
    private String getUsuarioLogado() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }

    private boolean isAdmin() {
        return SecurityContextHolder.getContext().getAuthentication().getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_Admin") || a.getAuthority().equals("Admin"));
    }

    // --- LOGIN ---
    @PostMapping("/api/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest req, HttpServletRequest request) {
        try {
            // 1. Tenta autenticar via Spring Security
            UsernamePasswordAuthenticationToken token =
                    new UsernamePasswordAuthenticationToken(req.usuario, req.senha);

            Authentication authentication = authenticationManager.authenticate(token);

            // 2. Salva no contexto de segurança
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(authentication);
            SecurityContextHolder.setContext(context);

            // 3. Persiste na sessão HTTP
            HttpSession session = request.getSession(true);
            session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);

            // 4. Busca dados extras para retornar ao front
            Usuario userDB = usuarioRepository.findByUsuario(req.usuario).orElse(new Usuario());

            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "nome", userDB.getNome(),
                    "funcao", userDB.getFuncao()
            ));

        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(401).body(Map.of("success", false, "message", "Credenciais inválidas"));
        }
    }

    // O Logout é tratado automaticamente pelo SecurityConfig, mas se quiser um endpoint explícito:
    @GetMapping("/api/dados_usuario")
    public ResponseEntity<?> dadosUsuario() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getPrincipal())) {
            return ResponseEntity.ok(Map.of());
        }
        // Tenta buscar o nome real no banco, ou usa o login
        String login = auth.getName();
        String nome = usuarioRepository.findByUsuario(login)
                .map(Usuario::getNome)
                .orElse(login);

        return ResponseEntity.ok(Map.of("login", login, "nome", nome));
    }

    // --- ADMINISTRAÇÃO ---

    @GetMapping("/api/logs")
    public ResponseEntity<?> logs() {
        if (!isAdmin()) return ResponseEntity.status(403).build();
        return ResponseEntity.ok(usuarioService.listarLogs());
    }

    @GetMapping("/api/lista_usuarios")
    public ResponseEntity<?> listarUsuarios() {
        if (!isAdmin()) return ResponseEntity.status(403).build();
        return ResponseEntity.ok(usuarioService.listarTodos());
    }

    @PostMapping("/api/criar_usuario")
    public ResponseEntity<?> criarUsuario(@RequestBody UserRequest req) {
        if (!isAdmin()) return ResponseEntity.status(403).build();

        try {
            usuarioService.criarUsuario(getUsuarioLogado(), req.nome, req.usuario, req.senha, req.funcao);
            return ResponseEntity.ok(Map.of("success", true, "message", "Usuário criado!"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    @PostMapping("/api/admin_reset_senha")
    public ResponseEntity<?> resetSenha(@RequestBody PasswordResetRequest req) {
        if (!isAdmin()) return ResponseEntity.status(403).build();

        usuarioService.alterarSenhaPorId(getUsuarioLogado(), req.id, req.nova_senha);
        return ResponseEntity.ok(Map.of("success", true, "message", "Senha alterada."));
    }

    // --- PERFIL ---

    @PostMapping("/api/alterar_perfil")
    public ResponseEntity<?> alterarPerfil(@RequestBody ProfileRequest req) {
        String usuarioAtual = getUsuarioLogado();

        boolean sucesso = usuarioService.atualizarPerfil(usuarioAtual, req.novo_nome, req.novo_login, req.nova_senha);

        if (sucesso) {
            // Nota: Se mudar o login, o usuário precisará logar de novo na próxima requisição,
            // pois o token de autenticação antigo ainda terá o nome antigo.
            return ResponseEntity.ok(Map.of("success", true));
        }
        return ResponseEntity.badRequest().body(Map.of("success", false));
    }
}