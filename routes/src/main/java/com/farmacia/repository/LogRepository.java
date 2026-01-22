package com.farmacia.repository;

import com.farmacia.model.Log;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface LogRepository extends JpaRepository<Log, Integer> {
    // Busca os últimos 100 logs para auditoria
    List<Log> findTop100ByOrderByIdDesc();
}