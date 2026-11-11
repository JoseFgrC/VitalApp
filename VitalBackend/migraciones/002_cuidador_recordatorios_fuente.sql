-- ============================================
-- Migración 002 — Cuidador, recordatorios y fuente documental (iteración I3)
-- Ejecutar una sola vez, después de la 001:
--   sudo mysql < migraciones/002_cuidador_recordatorios_fuente.sql
-- ============================================
USE vitalapp;

ALTER TABLE usuarios
    MODIFY rol ENUM('usuario','cuidador','admin') DEFAULT 'usuario';

ALTER TABLE videos
    ADD COLUMN fuente_documental VARCHAR(500) DEFAULT NULL AFTER contraindicaciones;

CREATE TABLE IF NOT EXISTS vinculos_cuidador (
    id_vinculo          INT AUTO_INCREMENT PRIMARY KEY,
    id_adulto           INT NOT NULL,
    id_cuidador         INT DEFAULT NULL,
    codigo              CHAR(6) NOT NULL,
    codigo_expira       DATETIME NOT NULL,
    estado              ENUM('invitacion','pendiente','autorizado','rechazado','revocado') NOT NULL DEFAULT 'invitacion',
    fecha_creacion      DATETIME DEFAULT CURRENT_TIMESTAMP,
    fecha_autorizacion  DATETIME DEFAULT NULL,
    fecha_revocacion    DATETIME DEFAULT NULL,
    FOREIGN KEY (id_adulto)   REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    FOREIGN KEY (id_cuidador) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS recordatorios (
    id_recordatorio     INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario          INT NOT NULL,
    hora                TIME NOT NULL,
    dias                VARCHAR(20) NOT NULL,
    etiqueta            VARCHAR(100) NOT NULL,
    activo              BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
