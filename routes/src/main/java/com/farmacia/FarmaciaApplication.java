package com.farmacia;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import com.farmacia.service.UsuarioService;
import org.springframework.beans.factory.annotation.Autowired;

@SpringBootApplication
public class FarmaciaApplication {

    @Autowired
    private UsuarioService usuarioService;

    public static void main(String[] args) {
        // Este é o comando que inicia o servidor Tomcat embutido e sobe a aplicação
        SpringApplication.run(FarmaciaApplication.class, args);
    }

    // Este evento roda logo após o sistema iniciar (substituto do criar_usuario_inicial do Python)
    @EventListener(ApplicationReadyEvent.class)
    public void doAfterStartup() {
        System.out.println("🚀 Sistema Farmácia iniciado! Verificando dados iniciais...");
        usuarioService.criarUsuarioInicial();
    }
}