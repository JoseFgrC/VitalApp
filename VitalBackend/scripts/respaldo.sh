#!/usr/bin/env bash
# Respaldo diario de la base de datos (RNF08).
# Usa las credenciales de VitalBackend/.env, guarda el respaldo comprimido en
# VitalBackend/respaldos/ y conserva solo los últimos DIAS_RETENCION días.
#
# Uso manual:   bash scripts/respaldo.sh
# Programarlo:  crontab -e  y agregar (todos los días a las 2:00 a. m.):
#   0 2 * * * cd /ruta/a/VitalBackend && bash scripts/respaldo.sh >> respaldos/respaldo.log 2>&1
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIAS_RETENCION=14

leer_env() { grep -E "^$1=" "$DIR/.env" | head -n1 | cut -d= -f2-; }
DB_HOST=$(leer_env DB_HOST); DB_USER=$(leer_env DB_USER)
DB_NAME=$(leer_env DB_NAME); DB_PORT=$(leer_env DB_PORT)
export MYSQL_PWD=$(leer_env DB_PASSWORD)

mkdir -p "$DIR/respaldos"
ARCHIVO="$DIR/respaldos/${DB_NAME}_$(date +%Y-%m-%d_%H%M).sql.gz"

# Sin --routines: los procedimientos almacenados están en schema.sql y exportarlos
# exigiría un privilegio global que el usuario de la app no necesita.
mysqldump -h "${DB_HOST:-localhost}" -P "${DB_PORT:-3306}" -u "$DB_USER" \
    --single-transaction --no-tablespaces "$DB_NAME" | gzip > "$ARCHIVO"

find "$DIR/respaldos" -name "${DB_NAME}_*.sql.gz" -mtime +"$DIAS_RETENCION" -delete
echo "$(date '+%F %T') Respaldo creado: $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1))"

# Para restaurar un respaldo:
#   gunzip < respaldos/vitalapp_AAAA-MM-DD_HHMM.sql.gz | mysql -u vitalapp -p vitalapp
