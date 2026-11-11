-- ============================================
-- Migración 001 — Consentimiento, valoración funcional y nivel (iteración I2)
-- Para bases creadas con una versión anterior de schema.sql. Ejecutar una sola vez:
--   sudo mysql < migraciones/001_consentimiento_valoracion_nivel.sql
-- ============================================
USE vitalapp;

ALTER TABLE usuarios
    ADD COLUMN nivel_funcional TINYINT DEFAULT NULL,
    ADD CHECK (nivel_funcional BETWEEN 0 AND 3);

ALTER TABLE videos
    ADD COLUMN nivel_funcional TINYINT NOT NULL DEFAULT 1 AFTER peso_maximo_recomendado,
    ADD COLUMN contraindicaciones TEXT DEFAULT NULL AFTER nivel_funcional,
    ADD CHECK (nivel_funcional BETWEEN 1 AND 3);

-- id_video pasa a ser opcional para registrar ejercicios de rutinas predefinidas
SET @fk := (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = 'vitalapp' AND TABLE_NAME = 'ejercicio_realizado'
              AND COLUMN_NAME = 'id_video' AND REFERENCED_TABLE_NAME = 'videos');
SET @sql := CONCAT('ALTER TABLE ejercicio_realizado DROP FOREIGN KEY ', @fk);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE ejercicio_realizado
    MODIFY id_video INT DEFAULT NULL,
    ADD COLUMN nombre_ejercicio VARCHAR(255) DEFAULT NULL AFTER id_video,
    MODIFY nivel_esfuerzo TINYINT DEFAULT NULL,
    ADD FOREIGN KEY (id_video) REFERENCES videos(id_video) ON DELETE SET NULL,
    ADD CHECK (nivel_esfuerzo BETWEEN 0 AND 10);

CREATE TABLE IF NOT EXISTS consentimientos (
    id_consentimiento   INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario          INT NOT NULL,
    version_aviso       VARCHAR(20) NOT NULL,
    acepta_datos_salud  BOOLEAN NOT NULL,
    fecha_otorgado      DATETIME DEFAULT CURRENT_TIMESTAMP,
    fecha_revocado      DATETIME DEFAULT NULL,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS valoraciones (
    id_valoracion       INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario          INT NOT NULL,
    tipo                ENUM('tamizaje','berg') NOT NULL,
    respuestas          JSON DEFAULT NULL,
    puntaje             INT DEFAULT NULL,
    aplicador           VARCHAR(150) DEFAULT NULL,
    fecha_aplicacion    DATE NOT NULL,
    nivel_resultante    TINYINT DEFAULT NULL,
    fecha_registro      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    CHECK (tipo <> 'berg' OR (puntaje BETWEEN 0 AND 56 AND aplicador IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
