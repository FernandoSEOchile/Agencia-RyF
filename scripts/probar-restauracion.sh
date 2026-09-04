#!/usr/bin/env bash
#
# Prueba que la última copia de seguridad se puede restaurar.
#
# Un respaldo que nunca se ha restaurado es una esperanza, no un respaldo.
# Esto levanta la última copia en una base aparte (appseo_prueba), cuenta las
# filas de las tablas grandes junto a las de la base real, y la borra. No toca
# la base de producción en ningún momento.
#
# Uso:  ./scripts/probar-restauracion.sh
# Conviene correrlo tras cambiar el esquema y, en cualquier caso, cada mes.

set -euo pipefail

PROYECTO=${PROYECTO:-/opt/panel}
DESTINO=${DESTINO:-/opt/respaldos}
cd "$PROYECTO"

ultimo=$(ls -t "$DESTINO"/appseo-*.sql.gz 2>/dev/null | head -1)
if [ -z "$ultimo" ]; then
  echo "No hay ninguna copia en $DESTINO." >&2
  exit 1
fi
echo "Copia: $ultimo ($(( $(stat -c%s "$ultimo") / 1024 )) KB)"

psql_admin() { docker compose exec -T base psql -U appseo -d postgres -q -c "$1"; }

psql_admin "DROP DATABASE IF EXISTS appseo_prueba" >/dev/null 2>&1 || true
psql_admin "CREATE DATABASE appseo_prueba" >/dev/null

# Los «does not exist, skipping» del --clean sobre una base vacía son normales.
if ! gunzip -c "$ultimo" | docker compose exec -T base psql -U appseo -d appseo_prueba -q >/tmp/restauracion.log 2>&1; then
  if grep -v "does not exist, skipping" /tmp/restauracion.log | grep -qi "error"; then
    echo "La restauración dio errores:" >&2
    grep -i "error" /tmp/restauracion.log | head -10 >&2
    psql_admin "DROP DATABASE appseo_prueba" >/dev/null
    exit 1
  fi
fi

docker compose exec -T base psql -U appseo -d appseo_prueba -q -c "ANALYZE" >/dev/null

cuenta() {
  docker compose exec -T base psql -U appseo -d "$1" -tA -F"|" \
    -c "select relname, n_live_tup from pg_stat_user_tables order by relname"
}

echo
printf "%-22s %12s %12s\n" "tabla" "copia" "real"
join -t"|" <(cuenta appseo_prueba) <(cuenta appseo) \
  | awk -F"|" '$2 > 0 || $3 > 0 { printf "%-22s %12s %12s\n", $1, $2, $3 }'

psql_admin "DROP DATABASE appseo_prueba" >/dev/null
echo
echo "$(date +'%F %T')  La copia se restaura bien. Base de prueba borrada."
