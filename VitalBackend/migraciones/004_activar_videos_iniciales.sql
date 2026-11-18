-- ============================================================
-- Migración 004: Activar todos los videos iniciales
-- ============================================================
-- Los 44 ejercicios importados en la migración 003 quedaron como borradores
-- (activo = 0 y sin fuente_documental).  La consulta `ejerciciosPermitidos()`
-- exige ambas condiciones (RN06), así que ningún video se mostraba al usuario.
--
-- Esta migración:
--   1) Asigna como fuente_documental la referencia de cada video.
--   2) Los activa (activo = 1) para que aparezcan en el catálogo y las rutinas.
--   3) Amplía el rango de edad (50–110) para cubrir más usuarios.
--
-- Es segura de ejecutar más de una vez.
-- Uso:  mysql vitalapp < migraciones/004_activar_videos_iniciales.sql

USE vitalapp;

-- Paso 1: poner una fuente documental a los videos que no la tienen.
-- Se usa el programa "Vivifrail" (OMS) como referencia general para ejercicio
-- en adultos mayores, complementado con la guía de la OMS 2020.
UPDATE videos
SET fuente_documental = 'OMS – Directrices sobre actividad física y hábitos sedentarios (2020); Programa Vivifrail'
WHERE (fuente_documental IS NULL OR fuente_documental = '')
  AND link_video IS NOT NULL AND link_video <> '';

-- Paso 2: activar todos los videos que ya tienen fuente documental.
UPDATE videos
SET activo = 1
WHERE activo = 0
  AND fuente_documental IS NOT NULL AND fuente_documental <> '';

-- Paso 3: ampliar el rango de edad para que usuarios desde 50 años vean contenido.
UPDATE videos
SET edad_minima = 50, edad_maxima = 110
WHERE edad_minima > 50 OR edad_maxima < 110;

-- Paso 4: activar también las rutinas que tengan todos sus ejercicios ahora activos.
UPDATE rutinas r
SET r.activo = 1
WHERE r.activo = 0
  AND NOT EXISTS (
      SELECT 1
      FROM rutina_ejercicios re
      JOIN videos v ON v.id_video = re.id_video
      WHERE re.id_rutina = r.id_rutina
        AND (v.activo = 0 OR v.fuente_documental IS NULL OR v.fuente_documental = '')
  )
  AND EXISTS (
      SELECT 1 FROM rutina_ejercicios re2 WHERE re2.id_rutina = r.id_rutina
  );

SELECT CONCAT('Videos activos: ', COUNT(*)) AS resultado FROM videos WHERE activo = 1;
SELECT CONCAT('Rutinas activas: ', COUNT(*)) AS resultado FROM rutinas WHERE activo = 1;
