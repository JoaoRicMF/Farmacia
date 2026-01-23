package com.farmacia.service;

import com.farmacia.model.*;
import com.farmacia.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
// PasswordEncoder não é mais necessário aqui se não formos fazer hash,
// mas podemos mantê-lo injetado se o SecurityConfig o exigir, ou simplesmente não usar.
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class UsuarioService implements UserDetailsService {

    @Autowired private UsuarioRepository usuarioRepository;
    @Autowired private LogRepository logRepository;
    // @Autowired private PasswordEncoder passwordEncoder; // Pode remover ou ignorar

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        Usuario usuario = usuarioRepository.findByUsuario(username)
                .orElseThrow(() -> new UsernameNotFoundException("Usuário não encontrado"));

        return User.builder()
                .username(usuario.getUsuario())
                .password(usuario.getSenha())
                .roles(usuario.getFuncao())
                .build();
    }

    // --- INICIALIZAÇÃO ---
    public void criarUsuarioInicial() {
        // Tenta buscar o admin existente ou cria um novo objeto se não achar
        Usuario admin = usuarioRepository.findByUsuario("admin").orElse(new Usuario());

        admin.setUsuario("admin");
        admin.setNome("Administrador");
        admin.setFuncao("Admin");

        // AQUI ESTÁ A CORREÇÃO: Força a senha ser "admin123" em texto puro novamente
        admin.setSenha("admin123");

        usuarioRepository.save(admin);
        System.out.println("⚠️ Usuário 'admin' verificado/atualizado (SENHA PLANA: admin123).");
    }

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
        // ALTERADO: Salva a senha pura
        u.setSenha(senha);
        u.setFuncao(funcao);
        usuarioRepository.save(u);

        registrarLog(adminLog, "Gestão Usuários", "Criou usuário: " + login);
    }

    // --- ALTERAÇÃO DE SENHA (ADMIN) ---
    @Transactional
    public void alterarSenhaPorId(String adminLog, Integer id, String novaSenha) {
        usuarioRepository.findById(id).ifPresent(u -> {
            // ALTERADO: Salva a senha pura
            u.setSenha(novaSenha);
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
                // ALTERADO: Salva a senha pura
                u.setSenha(novaSenha);
            }
            usuarioRepository.save(u);
            registrarLog(usuarioAtual, "Perfil", "Atualizou os próprios dados");
            return true;
        }
        return false;
    }

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