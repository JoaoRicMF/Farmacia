// src/main/java/com/farmacia/config/SecurityConfig.java
package com.farmacia.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable()) // Desabilita CSRF para simplificar APIs
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/", "/index.html", "/static/**", "/css/**", "/js/**").permitAll() // Frontend estático
                        .requestMatchers("/api/login").permitAll() // Endpoint de login público
                        .anyRequest().permitAll() // Deixamos as checagens de sessão manuais nos Controllers para igualar ao Python
                );

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}