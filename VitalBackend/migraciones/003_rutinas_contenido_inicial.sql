-- ============================================================
-- Migración 003: rutinas administrables + contenido inicial de Inicio
-- ============================================================
-- 1) Tablas para que el administrador arme las rutinas del día con ejercicios del catálogo.
-- 2) Importa como BORRADORES los 44 ejercicios y 7 rutinas que antes estaban fijos en el
--    código de la app (home.tsx), con el mismo video de YouTube que mostraban.
--    Quedan inactivos y sin fuente documental: RN06 exige revisarlos antes de publicarlos.
--    Mientras no haya contenido activo, la app sigue mostrando la lista fija como respaldo.
--
-- Se puede ejecutar más de una vez: no duplica tablas ni registros.
-- Uso:  sudo mysql vitalapp < migraciones/003_rutinas_contenido_inicial.sql

USE vitalapp;

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

-- Ejercicios importados como BORRADORES (activo = 0, sin fuente documental).
-- RN06: el administrador debe revisar cada video, escribir su fuente y activarlo.
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Respiración Diafragmática', 'Ejercicio de la rutina «Rutina suave matutina».', 'Respiración', 'baja', 5, 'https://www.youtube.com/watch?v=POGexZe7Bxw', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Respiración Diafragmática');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Círculos con Hombros', 'Ejercicio de la rutina «Rutina suave matutina».', 'Movilidad', 'baja', 5, 'https://www.youtube.com/watch?v=ZvfDryEt5bw', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Círculos con Hombros');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Estiramiento Lateral', 'Ejercicio de la rutina «Rutina suave matutina».', 'Flexibilidad', 'baja', 5, 'https://www.youtube.com/watch?v=o50BQDwaDcI', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Estiramiento Lateral');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Movimiento de Tobillos', 'Ejercicio de la rutina «Rutina suave matutina».', 'Movilidad', 'baja', 5, 'https://www.youtube.com/watch?v=uJZk7jafw-o', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Movimiento de Tobillos');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Rotación de Cuello', 'Ejercicio de la rutina «Rutina suave matutina».', 'Movilidad', 'baja', 5, 'https://www.youtube.com/watch?v=KcdkySvCRCc', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Rotación de Cuello');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Marcha en el Lugar', 'Ejercicio de la rutina «Movilidad y equilibrio».', 'Cardio', 'media', 5, 'https://www.youtube.com/watch?v=Z26PWsBsSFY', 2, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Marcha en el Lugar');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Equilibrio en un Pie', 'Ejercicio de la rutina «Movilidad y equilibrio».', 'Equilibrio', 'media', 5, 'https://www.youtube.com/watch?v=b2gF0nTAY0o', 2, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Equilibrio en un Pie');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Sentadilla con Silla', 'Ejercicio de la rutina «Movilidad y equilibrio».', 'Fuerza', 'media', 5, 'https://www.youtube.com/watch?v=b2gF0nTAY0o', 2, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Sentadilla con Silla');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Estiramiento de Espalda', 'Ejercicio de la rutina «Movilidad y equilibrio».', 'Flexibilidad', 'media', 5, 'https://www.youtube.com/watch?v=o50BQDwaDcI', 2, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Estiramiento de Espalda');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Elevación de Brazos', 'Ejercicio de la rutina «Fuerza suave de brazos».', 'Fuerza', 'baja', 5, 'https://www.youtube.com/watch?v=ZvfDryEt5bw', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Elevación de Brazos');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Curl de Bíceps', 'Ejercicio de la rutina «Fuerza suave de brazos».', 'Fuerza', 'baja', 5, 'https://www.youtube.com/watch?v=YaM1_I8omDw', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Curl de Bíceps');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Press contra Pared', 'Ejercicio de la rutina «Fuerza suave de brazos».', 'Fuerza', 'baja', 5, 'https://www.youtube.com/watch?v=YaM1_I8omDw', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Press contra Pared');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Extensión de Pierna', 'Ejercicio de la rutina «Fuerza suave de brazos».', 'Fuerza', 'baja', 5, 'https://www.youtube.com/watch?v=uJZk7jafw-o', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Extensión de Pierna');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Respiración Profunda', 'Ejercicio de la rutina «Relajación activa».', 'Respiración', 'baja', 5, 'https://www.youtube.com/watch?v=POGexZe7Bxw', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Respiración Profunda');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Yoga en Silla', 'Ejercicio de la rutina «Relajación activa».', 'Relajación', 'baja', 5, 'https://www.youtube.com/watch?v=1DYH5ud3zHo', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Yoga en Silla');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Meditación Guiada', 'Ejercicio de la rutina «Relajación activa».', 'Relajación', 'baja', 5, 'https://www.youtube.com/watch?v=wEIK-2LaRwY', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Meditación Guiada');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Caminata en el Lugar', 'Ejercicio de la rutina «Cardio ligero».', 'Cardio', 'media', 5, 'https://www.youtube.com/watch?v=Z26PWsBsSFY', 2, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Caminata en el Lugar');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Paso Lateral', 'Ejercicio de la rutina «Cardio ligero».', 'Cardio', 'media', 5, 'https://www.youtube.com/watch?v=KcdkySvCRCc', 2, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Paso Lateral');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Rodillas Arriba', 'Ejercicio de la rutina «Cardio ligero».', 'Cardio', 'media', 5, 'https://www.youtube.com/watch?v=uJZk7jafw-o', 2, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Rodillas Arriba');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Estiramiento Final', 'Ejercicio de la rutina «Cardio ligero».', 'Flexibilidad', 'media', 5, 'https://www.youtube.com/watch?v=o50BQDwaDcI', 2, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Estiramiento Final');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Círculos de Muñecas', 'Ejercicio de la rutina «Articulaciones sanas».', 'Movilidad', 'baja', 5, 'https://www.youtube.com/watch?v=KcdkySvCRCc', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Círculos de Muñecas');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Movimiento de Hombros', 'Ejercicio de la rutina «Articulaciones sanas».', 'Movilidad', 'baja', 5, 'https://www.youtube.com/watch?v=ZvfDryEt5bw', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Movimiento de Hombros');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Estiramiento de Cuello', 'Ejercicio de la rutina «Articulaciones sanas».', 'Flexibilidad', 'baja', 5, 'https://www.youtube.com/watch?v=ZvfDryEt5bw', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Estiramiento de Cuello');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Rotación de Tobillos', 'Ejercicio de la rutina «Articulaciones sanas».', 'Movilidad', 'baja', 5, 'https://www.youtube.com/watch?v=y8IaBla_tQ4', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Rotación de Tobillos');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Relajación de Espalda', 'Ejercicio de la rutina «Articulaciones sanas».', 'Movilidad', 'baja', 5, 'https://www.youtube.com/watch?v=o50BQDwaDcI', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Relajación de Espalda');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Press de Pesas Ligeras', 'Ejercicio de la rutina «Pesas ligeras».', 'Fuerza', 'media', 5, 'https://www.youtube.com/watch?v=z-_lgQe9NJs', 2, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Press de Pesas Ligeras');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Elevación Lateral de Brazos', 'Ejercicio de la rutina «Pesas ligeras».', 'Fuerza', 'media', 5, 'https://www.youtube.com/watch?v=o50BQDwaDcI', 2, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Elevación Lateral de Brazos');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Curl de Bíceps con Pesas', 'Ejercicio de la rutina «Pesas ligeras».', 'Fuerza', 'media', 5, 'https://www.youtube.com/watch?v=z-_lgQe9NJs', 2, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Curl de Bíceps con Pesas');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Estiramiento Post-Ejercicio', 'Ejercicio de la rutina «Pesas ligeras».', 'Flexibilidad', 'media', 5, 'https://www.youtube.com/watch?v=ZvfDryEt5bw', 2, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Estiramiento Post-Ejercicio');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Zumba Gold Alegre', 'Ritmos latinos divertidos para todos', 'Zumba', 'media', 15, 'https://www.youtube.com/watch?v=0KJaefStf5s', 2, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Zumba Gold Alegre');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Baile en Silla', 'Música y movimiento sin levantarte', 'Baile', 'baja', 10, 'https://www.youtube.com/watch?v=Yge5lZJC41Q', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Baile en Silla');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Ritmo para el Alma', 'Baile suave con canciones clásicas', 'Baile', 'baja', 12, 'https://www.youtube.com/watch?v=8o9JJ17JrTw', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Ritmo para el Alma');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Despierta tu cuerpo', 'Activa tu cuerpo suavemente al despertar', 'Movilidad', 'baja', 15, 'https://www.youtube.com/watch?v=uJZk7jafw-o', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Despierta tu cuerpo');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Movilidad en silla', 'Ejercicios sentado para articulaciones', 'Silla', 'baja', 20, 'https://www.youtube.com/watch?v=YaM1_I8omDw', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Movilidad en silla');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Prevención caídas', 'Mejora tu equilibrio y estabilidad', 'Equilibrio', 'media', 10, 'https://www.youtube.com/watch?v=b2gF0nTAY0o', 2, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Prevención caídas');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Respiración y calma', 'Técnicas de relajación y respiración', 'Respiración', 'baja', 15, 'https://www.youtube.com/watch?v=POGexZe7Bxw', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Respiración y calma');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Fuerza suave brazos', 'Fortalece brazos y hombros sin riesgo', 'Fuerza', 'media', 15, 'https://www.youtube.com/watch?v=YaM1_I8omDw', 2, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Fuerza suave brazos');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Circulación piernas', 'Activa la circulación en tus piernas', 'Movilidad', 'baja', 20, 'https://www.youtube.com/watch?v=y8IaBla_tQ4', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Circulación piernas');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Flexibilidad total', 'Estiramientos completos para todo el cuerpo', 'Flexibilidad', 'baja', 15, 'https://www.youtube.com/watch?v=Z26PWsBsSFY', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Flexibilidad total');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Postura y columna', 'Corrige tu postura con ejercicios suaves', 'Movilidad', 'baja', 10, 'https://www.youtube.com/watch?v=Z26PWsBsSFY', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Postura y columna');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Core para mayores', 'Fortalece tu zona media para mayor estabilidad', 'Fuerza', 'media', 12, 'https://www.youtube.com/watch?v=n3z6GVr6WL4', 2, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Core para mayores');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Yoga relajante', 'Posturas suaves para relajar mente y cuerpo', 'Yoga', 'baja', 20, 'https://www.youtube.com/watch?v=b2gF0nTAY0o', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Yoga relajante');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Cardio en casa', 'Mejora tu salud cardiovascular sin impacto', 'Cardio', 'media', 15, 'https://www.youtube.com/watch?v=uJZk7jafw-o', 2, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Cardio en casa');
INSERT INTO videos (nombre_video, descripcion, categoria, dificultad, duracion_min, link_video, nivel_funcional, activo)
SELECT 'Manos y muñecas', 'Ejercicios para mantener la agilidad manual', 'Movilidad', 'baja', 10, 'https://www.youtube.com/watch?v=YaM1_I8omDw', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM videos WHERE nombre_video = 'Manos y muñecas');

-- Rutinas del día (también como borradores)
INSERT INTO rutinas (titulo, descripcion, categoria, nivel_funcional, activo)
SELECT 'Rutina suave matutina', NULL, 'Movilidad', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM rutinas WHERE titulo = 'Rutina suave matutina');
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 1, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Respiración Diafragmática' WHERE r.titulo = 'Rutina suave matutina';
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 2, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Círculos con Hombros' WHERE r.titulo = 'Rutina suave matutina';
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 3, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Estiramiento Lateral' WHERE r.titulo = 'Rutina suave matutina';
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 4, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Movimiento de Tobillos' WHERE r.titulo = 'Rutina suave matutina';
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 5, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Rotación de Cuello' WHERE r.titulo = 'Rutina suave matutina';
INSERT INTO rutinas (titulo, descripcion, categoria, nivel_funcional, activo)
SELECT 'Movilidad y equilibrio', NULL, 'Equilibrio', 2, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM rutinas WHERE titulo = 'Movilidad y equilibrio');
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 1, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Marcha en el Lugar' WHERE r.titulo = 'Movilidad y equilibrio';
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 2, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Equilibrio en un Pie' WHERE r.titulo = 'Movilidad y equilibrio';
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 3, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Sentadilla con Silla' WHERE r.titulo = 'Movilidad y equilibrio';
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 4, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Estiramiento de Espalda' WHERE r.titulo = 'Movilidad y equilibrio';
INSERT INTO rutinas (titulo, descripcion, categoria, nivel_funcional, activo)
SELECT 'Fuerza suave de brazos', NULL, 'Fuerza', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM rutinas WHERE titulo = 'Fuerza suave de brazos');
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 1, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Elevación de Brazos' WHERE r.titulo = 'Fuerza suave de brazos';
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 2, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Curl de Bíceps' WHERE r.titulo = 'Fuerza suave de brazos';
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 3, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Press contra Pared' WHERE r.titulo = 'Fuerza suave de brazos';
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 4, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Extensión de Pierna' WHERE r.titulo = 'Fuerza suave de brazos';
INSERT INTO rutinas (titulo, descripcion, categoria, nivel_funcional, activo)
SELECT 'Relajación activa', NULL, 'Relajación', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM rutinas WHERE titulo = 'Relajación activa');
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 1, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Respiración Profunda' WHERE r.titulo = 'Relajación activa';
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 2, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Yoga en Silla' WHERE r.titulo = 'Relajación activa';
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 3, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Meditación Guiada' WHERE r.titulo = 'Relajación activa';
INSERT INTO rutinas (titulo, descripcion, categoria, nivel_funcional, activo)
SELECT 'Cardio ligero', NULL, 'Cardio', 2, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM rutinas WHERE titulo = 'Cardio ligero');
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 1, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Caminata en el Lugar' WHERE r.titulo = 'Cardio ligero';
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 2, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Paso Lateral' WHERE r.titulo = 'Cardio ligero';
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 3, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Rodillas Arriba' WHERE r.titulo = 'Cardio ligero';
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 4, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Estiramiento Final' WHERE r.titulo = 'Cardio ligero';
INSERT INTO rutinas (titulo, descripcion, categoria, nivel_funcional, activo)
SELECT 'Articulaciones sanas', NULL, 'Movilidad', 1, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM rutinas WHERE titulo = 'Articulaciones sanas');
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 1, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Círculos de Muñecas' WHERE r.titulo = 'Articulaciones sanas';
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 2, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Movimiento de Hombros' WHERE r.titulo = 'Articulaciones sanas';
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 3, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Estiramiento de Cuello' WHERE r.titulo = 'Articulaciones sanas';
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 4, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Rotación de Tobillos' WHERE r.titulo = 'Articulaciones sanas';
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 5, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Relajación de Espalda' WHERE r.titulo = 'Articulaciones sanas';
INSERT INTO rutinas (titulo, descripcion, categoria, nivel_funcional, activo)
SELECT 'Pesas ligeras', NULL, 'Fuerza', 2, 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM rutinas WHERE titulo = 'Pesas ligeras');
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 1, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Press de Pesas Ligeras' WHERE r.titulo = 'Pesas ligeras';
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 2, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Elevación Lateral de Brazos' WHERE r.titulo = 'Pesas ligeras';
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 3, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Curl de Bíceps con Pesas' WHERE r.titulo = 'Pesas ligeras';
INSERT IGNORE INTO rutina_ejercicios (id_rutina, orden, id_video)
SELECT r.id_rutina, 4, v.id_video FROM rutinas r JOIN videos v ON v.nombre_video = 'Estiramiento Post-Ejercicio' WHERE r.titulo = 'Pesas ligeras';
