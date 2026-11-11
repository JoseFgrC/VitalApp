-- ============================================
-- VitalApp — Esquema de Base de Datos
-- ============================================

CREATE DATABASE IF NOT EXISTS vitalapp;
USE vitalapp;

-- ============================================
-- TABLA: usuarios
-- ============================================
CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario        INT AUTO_INCREMENT PRIMARY KEY,
    nombre            VARCHAR(150) NOT NULL,
    email             VARCHAR(255) NOT NULL UNIQUE,
    password_hash     VARCHAR(255) NOT NULL,
    fecha_nacimiento  DATE NOT NULL,
    peso              DECIMAL(5,2) DEFAULT NULL,
    altura            DECIMAL(5,2) DEFAULT NULL,
    genero            VARCHAR(20)  DEFAULT NULL,
    telefono          VARCHAR(20)  DEFAULT NULL,
    rol               ENUM('usuario','cuidador','admin') DEFAULT 'usuario',
    cuenta_activa     BOOLEAN DEFAULT TRUE,
    fecha_registro    DATETIME DEFAULT CURRENT_TIMESTAMP,
    nivel_actividad   VARCHAR(50)  DEFAULT 'sedentario',
    condiciones_medicas TEXT DEFAULT NULL,
    restricciones     TEXT DEFAULT NULL,
    mfa_secret        VARCHAR(255) DEFAULT NULL,
    mfa_enabled       BOOLEAN DEFAULT FALSE,
    -- 0 = no apto sin autorización médica, 1 = riesgo alto, 2 = medio, 3 = bajo (RN02)
    nivel_funcional   TINYINT DEFAULT NULL,
    CHECK (nivel_funcional BETWEEN 0 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- TABLA: videos (ejercicios)
-- ============================================
CREATE TABLE IF NOT EXISTS videos (
    id_video                INT AUTO_INCREMENT PRIMARY KEY,
    nombre_video            VARCHAR(255) NOT NULL,
    descripcion             TEXT DEFAULT NULL,
    categoria               VARCHAR(100) NOT NULL,
    subcategoria            VARCHAR(100) DEFAULT NULL,
    dificultad              VARCHAR(50)  NOT NULL,
    duracion_min            INT NOT NULL,
    link_video              VARCHAR(500) NOT NULL,
    url_miniatura           VARCHAR(500) DEFAULT NULL,
    calorias_estimadas      INT DEFAULT NULL,
    edad_minima             INT DEFAULT 60,
    edad_maxima             INT DEFAULT 100,
    peso_maximo_recomendado DECIMAL(5,2) DEFAULT NULL,
    -- Nivel funcional mínimo requerido; solo se muestra a usuarios de ese nivel o superior (RN03)
    nivel_funcional         TINYINT NOT NULL DEFAULT 1,
    contraindicaciones      TEXT DEFAULT NULL,
    -- RN06: un ejercicio sin fuente documental no puede publicarse (activo = 1)
    fuente_documental       VARCHAR(500) DEFAULT NULL,
    fecha_creacion          DATETIME DEFAULT CURRENT_TIMESTAMP,
    activo                  BOOLEAN DEFAULT TRUE,
    CHECK (nivel_funcional BETWEEN 1 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- TABLA: ejercicio_realizado
-- ============================================
CREATE TABLE IF NOT EXISTS ejercicio_realizado (
    id_ejercicio        INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario          INT NOT NULL,
    -- NULL cuando el ejercicio pertenece a una rutina predefinida de la app
    id_video            INT DEFAULT NULL,
    nombre_ejercicio    VARCHAR(255) DEFAULT NULL,
    fecha_hora_inicio   DATETIME DEFAULT CURRENT_TIMESTAMP,
    fecha_hora_fin      DATETIME DEFAULT NULL,
    duracion_segundos   INT DEFAULT NULL,
    calorias_quemadas   DECIMAL(7,2) DEFAULT NULL,
    -- Esfuerzo percibido, escala de Borg simplificada 0–10 (RD04)
    nivel_esfuerzo      TINYINT DEFAULT NULL,
    completado          BOOLEAN DEFAULT TRUE,
    comentarios         TEXT DEFAULT NULL,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    FOREIGN KEY (id_video)   REFERENCES videos(id_video)     ON DELETE SET NULL,
    CHECK (nivel_esfuerzo BETWEEN 0 AND 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- TABLA: consentimientos (aviso de privacidad y datos de salud, RN01)
-- ============================================
CREATE TABLE IF NOT EXISTS consentimientos (
    id_consentimiento   INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario          INT NOT NULL,
    version_aviso       VARCHAR(20) NOT NULL,
    acepta_datos_salud  BOOLEAN NOT NULL,
    fecha_otorgado      DATETIME DEFAULT CURRENT_TIMESTAMP,
    fecha_revocado      DATETIME DEFAULT NULL,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- TABLA: valoraciones (tamizaje y Escala de Berg)
-- ============================================
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
    -- RN04: Berg solo en el rango 0–56 y con aplicador identificado
    CHECK (tipo <> 'berg' OR (puntaje BETWEEN 0 AND 56 AND aplicador IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- TABLA: evolucion_usuario
-- ============================================
CREATE TABLE IF NOT EXISTS evolucion_usuario (
    id_evolucion                INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario                  INT NOT NULL,
    fecha_registro              DATE NOT NULL,
    peso                        DECIMAL(5,2) DEFAULT NULL,
    presion_arterial_sistolica  INT DEFAULT NULL,
    presion_arterial_diastolica INT DEFAULT NULL,
    frecuencia_cardiaca_reposo  INT DEFAULT NULL,
    flexibilidad_cm             DECIMAL(5,2) DEFAULT NULL,
    fuerza_prensalon_kg         DECIMAL(5,2) DEFAULT NULL,
    equilibrio_segundos         INT DEFAULT NULL,
    notas                       TEXT DEFAULT NULL,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- TABLA: reporte_semanal
-- ============================================
CREATE TABLE IF NOT EXISTS reporte_semanal (
    id_reporte            INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario            INT NOT NULL,
    fecha_inicio_semana   DATE NOT NULL,
    fecha_fin_semana      DATE NOT NULL,
    total_ejercicios      INT DEFAULT 0,
    total_minutos         INT DEFAULT 0,
    total_calorias        DECIMAL(7,2) DEFAULT 0,
    dias_activos          INT DEFAULT 0,
    promedio_esfuerzo     VARCHAR(50) DEFAULT NULL,
    progreso_fisico       TEXT DEFAULT NULL,
    observaciones         TEXT DEFAULT NULL,
    fecha_generacion      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- TABLA: configuracion_ejercicios
-- ============================================
CREATE TABLE IF NOT EXISTS configuracion_ejercicios (
    id_config               INT AUTO_INCREMENT PRIMARY KEY,
    edad_min                INT NOT NULL,
    edad_max                INT NOT NULL,
    peso_min                DECIMAL(5,2) DEFAULT NULL,
    peso_max                DECIMAL(5,2) DEFAULT NULL,
    nivel_dificultad        VARCHAR(50) DEFAULT NULL,
    condiciones_especiales  TEXT DEFAULT NULL,
    categoria_recomendada   VARCHAR(100) DEFAULT NULL,
    max_minutos_diarios     INT DEFAULT 30,
    dias_semana_recomendados INT DEFAULT 3
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- TABLA: vinculos_cuidador (RN05: el cuidador solo ve a quien lo autorizó)
-- estado: invitacion (código generado) → pendiente (el cuidador usó el código)
--         → autorizado | rechazado; autorizado → revocado
-- ============================================
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

-- ============================================
-- TABLA: recordatorios (RF13)
-- ============================================
CREATE TABLE IF NOT EXISTS recordatorios (
    id_recordatorio     INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario          INT NOT NULL,
    hora                TIME NOT NULL,
    dias                VARCHAR(20) NOT NULL,
    etiqueta            VARCHAR(100) NOT NULL,
    activo              BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- TABLAS: rutinas y rutina_ejercicios (rutinas del día armadas por el administrador)
-- El contenido inicial se carga con migraciones/003_rutinas_contenido_inicial.sql
-- ============================================
CREATE TABLE IF NOT EXISTS rutinas (
    id_rutina        INT AUTO_INCREMENT PRIMARY KEY,
    titulo           VARCHAR(150) NOT NULL UNIQUE,
    descripcion      TEXT DEFAULT NULL,
    -- Categoría principal: se usa para no recomendarla ante ciertas condiciones de salud
    categoria        VARCHAR(100) NOT NULL DEFAULT 'Movilidad',
    -- Se calcula al guardar: el nivel más alto de sus ejercicios (RN03)
    nivel_funcional  TINYINT NOT NULL DEFAULT 1,
    activo           BOOLEAN DEFAULT FALSE,
    fecha_creacion   DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (nivel_funcional BETWEEN 1 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rutina_ejercicios (
    id_rutina  INT NOT NULL,
    orden      TINYINT NOT NULL,
    id_video   INT NOT NULL,
    PRIMARY KEY (id_rutina, orden),
    FOREIGN KEY (id_rutina) REFERENCES rutinas(id_rutina) ON DELETE CASCADE,
    FOREIGN KEY (id_video)  REFERENCES videos(id_video)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- STORED PROCEDURES
-- ============================================

DELIMITER //

CREATE PROCEDURE IF NOT EXISTS sp_eliminar_video(IN p_id INT)
BEGIN
    DELETE FROM videos WHERE id_video = p_id;
    SELECT ROW_COUNT() AS filas_afectadas;
END //

CREATE PROCEDURE IF NOT EXISTS sp_eliminar_config(IN p_id INT)
BEGIN
    DELETE FROM configuracion_ejercicios WHERE id_config = p_id;
    SELECT ROW_COUNT() AS filas_afectadas;
END //

CREATE PROCEDURE IF NOT EXISTS sp_eliminar_usuario(IN p_id INT)
BEGIN
    DELETE FROM usuarios WHERE id_usuario = p_id;
    SELECT ROW_COUNT() AS filas_afectadas;
END //

DELIMITER ;
