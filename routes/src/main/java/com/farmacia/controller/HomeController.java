package com.farmacia.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class HomeController {

    @GetMapping("/")
    public String index() {
        // O Spring Boot procura automaticamente por "index.html" em 'src/main/resources/static'
        // ou 'src/main/resources/templates' se usar Thymeleaf (mas seu front é HTML puro/JS)
        return "forward:/index.html";
    }
}