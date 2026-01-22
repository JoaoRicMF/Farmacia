package com.farmacia.service;

import com.farmacia.model.*;
import com.farmacia.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class UsuarioService implements UserDetailsService {

    @Autowired private UsuarioRepository usuarioRepository;
    @Autowired private LogRepository logRepository;
    @Autowired private PasswordEncoder passwordEncoder;

    // --- NOVO: Integração com Spring Security ---
    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        Usuario usuario = usuarioRepository.findByUsuario(username)
                .orElseThrow(() -> new UsernameNotFoundException("Usuário não encontrado"));

        return User.builder()
                .username(usuario.getUsuario())
                .password(usuario.getSenha())
                .roles(usuario.getFuncao()) // Ex: "Admin" vira "ROLE_Admin"
                .build();
    }

    // --- INICIALIZAÇÃO ---
    public void criarUsuarioInicial() {
        if (usuarioRepository.count() == 0) {
            Usuario admin = new Usuario();
            admin.setUsuario("admin");
            admin.setNome("Administrador");
            admin.setFuncao("Admin");
            admin.setSenha(passwordEncoder.encode("admin123"));
            usuarioRepository.save(admin);
            System.out.println("⚠️ Usuário 'admin' criado com a senha 'admin123'.");
        }
    }

    // --- LISTAGEM ---
    public List<Usuario> listarTodos() {
        return usuarioRepository.findAll();
    }

    public List<Log> listarLogs() {
        return logRepository.findTop100ByOrderByIdDesc();
    }

    // --- CRIAÇÃO ---
    @Transactional
    public void criarUsuario(String adminLog, String nome, String login, String senha, String funcao) {
        if (usuarioRepository.findByUsuario(login).isPresent()) {
            throw new RuntimeException("Usuário já existe.");
        }
        Usuario u = new Usuario();
        u.setNome(nome);
        u.setUsuario(login);
        u.setSenha(passwordEncoder.encode(senha));
        u.setFuncao(funcao);
        usuarioRepository.save(u);

        registrarLog(adminLog, "Gestão Usuários", "Criou usuário: " + login);
    }

    // --- ALTERAÇÃO DE SENHA (ADMIN) ---
    @Transactional
    public void alterarSenhaPorId(String adminLog, Integer id, String novaSenha) {
        usuarioRepository.findById(id).ifPresent(u -> {
            u.setSenha(passwordEncoder.encode(novaSenha));
            usuarioRepository.save(u);
            registrarLog(adminLog, "Segurança", "Resetou senha do usuário ID: " + id);
        });
    }

    // --- PERFIL DO USUÁRIO ---
    @Transactional
    public boolean atualizarPerfil(String usuarioAtual, String novoNome, String novoLogin, String novaSenha) {
        Optional<Usuario> opt = usuarioRepository.findByUsuario(usuarioAtual);

        if (opt.isPresent()) {
            Usuario u = opt.get();
            u.setNome(novoNome);
            u.setUsuario(novoLogin);
            if (novaSenha != null && !novaSenha.isEmpty()) {
                u.setSenha(passwordEncoder.encode(novaSenha));
            }
            usuarioRepository.save(u);
            registrarLog(usuarioAtual, "Perfil", "Atualizou os próprios dados");
            return true;
        }
        return false;
    }

    // --- LOGS ---
    public void registrarLog(String usuario, String acao, String detalhes) {
        try {
            Log log = new Log();
            log.setUsuario(usuario != null ? usuario : "Sistema");
            log.setAcao(acao);
            log.setDetalhes(detalhes);
            log.setDataHora(LocalDateTime.now());
            logRepository.save(log);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}