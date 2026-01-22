package com.farmacia.service;

import com.farmacia.model.*;
import com.farmacia.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class UsuarioService {

    @Autowired private UsuarioRepository usuarioRepository;
    @Autowired private LogRepository logRepository;
    @Autowired private PasswordEncoder passwordEncoder; // BCrypt configurado no SecurityConfig

    public void criarUsuarioInicial() {
        if (usuarioRepository.count() == 0) {
            Usuario admin = new Usuario();
            admin.setUsuario("admin");
            admin.setNome("Administrador");
            admin.setFuncao("Admin");
            admin.setSenha(passwordEncoder.encode("admin123")); // Senha inicial
            usuarioRepository.save(admin);
            System.out.println("⚠️ Usuário 'admin' criado.");
        }
    }

    public Usuario verificarLogin(String login, String senhaRaw) {
        Optional<Usuario> userOpt = usuarioRepository.findByUsuario(login);
        if (userOpt.isPresent() && passwordEncoder.matches(senhaRaw, userOpt.get().getSenha())) {
            return userOpt.get();
        }
        return null;
    }

    @Transactional
    public String criarNovoUsuario(String adminLog, String login, String senha, String nome, String funcao) {
        if (usuarioRepository.findByUsuario(login).isPresent()) {
            return "Erro: Usuário já existe.";
        }
        Usuario u = new Usuario();
        u.setUsuario(login);
        u.setSenha(passwordEncoder.encode(senha));
        u.setNome(nome);
        u.setFuncao(funcao);
        usuarioRepository.save(u);
        registrarLog(adminLog, "Gestão Usuários", "Criou usuário: " + login);
        return "Sucesso";
    }

    @Transactional
    public void alterarSenha(String nomeUsuario, String novaSenha) {
        Optional<Usuario> userOpt = usuarioRepository.findByNome(nomeUsuario);
        if (userOpt.isPresent()) {
            Usuario u = userOpt.get();
            u.setSenha(passwordEncoder.encode(novaSenha));
            usuarioRepository.save(u);
            registrarLog(nomeUsuario, "Segurança", "Alterou a senha");
        }
    }

    public void registrarLog(String usuario, String acao, String detalhes) {
        try {
            Log log = new Log();
            log.setUsuario(usuario);
            log.setAcao(acao);
            log.setDetalhes(detalhes);
            log.setDataHora(LocalDateTime.now());
            logRepository.save(log);
        } catch (Exception e) {
            System.err.println("Erro ao salvar log: " + e.getMessage());
        }
    }

    public List<Log> listarLogs() {
        return logRepository.findTop100ByOrderByIdDesc();
    }
}