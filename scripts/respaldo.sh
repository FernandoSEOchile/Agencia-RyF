#!/usr/bin/env bash
#
# Copia de seguridad de la base del panel.
#
# En esa base viven las credenciales de escritura de cada sitio, el token de
# Shopify, la conexión de Google y el histórico de posiciones. Nada de eso se
# puede volver a comprar: el histórico no existe en ningún otro sitio y las
# credenciales habría que regenerarlas cliente por cliente.
#
# Un aviso que conviene no olvidar: esto guarda las copias en la MISMA máquina.
# Protege de un borrado o de una migración que sale mal, no de perder el
# servidor. Para eso hacen falta los respaldos del VPS, que se activan en el
# hPanel de Hostinger, o bajarse un volcado de vez en cuando.
#
# Uso:  ./scripts/respaldo.sh
# Cron: 0 4 * * * /opt/panel/scripts/respaldo.sh >> /var/log/appseo-respaldo.log 2>&1
#
# Para restaurar una copia —y conviene probarlo una vez antes de necesitarlo:
#
#   gunzip -c /opt/respaldos/appseo-FECHA.sql.gz \
#     | docker compose exec -T base psql -U appseo -d appseo
#
# El volcado lleva --clean, así que borra y recrea cada tabla. Restaurar sobre
# una base con datos los reemplaza; no los mezcla.

set -euo pipefail

PROYECTO=${PROYECTO:-/opt/panel}
DESTINO=${DESTINO:-/opt/respaldos}
DIAS=${DIAS:-14}

# Por debajo de esto el volcado no es creíble y seguramente falló la conexión.
# Comprobarlo importa porque un pg_dump que falla a mitad devuelve 0 y deja un
# archivo corto: sin este límite, la rotación acabaría borrando las copias
# buenas y dejando solo las vacías.
MINIMO=${MINIMO:-20000}

cd "$PROYECTO"
mkdir -p "$DESTINO"

archivo="$DESTINO/appseo-$(date +%F-%H%M).sql.gz"

docker compose exec -T base pg_dump -U appseo -d appseo --clean --if-exists \
  | gzip -9 > "$archivo"

tam=$(stat -c%s "$archivo")

if [ "$tam" -lt "$MINIMO" ]; then
  echo "$(date +'%F %T')  AVISO: el volcado ocupa solo $tam bytes." >&2
  echo "  Revisa $archivo a mano antes de fiarte. No se ha borrado nada." >&2
  exit 1
fi

# La rotación va después de comprobar el tamaño, no antes: si el volcado de hoy
# salió mal, lo último que se quiere es haber borrado ya el bueno de ayer.
find "$DESTINO" -name 'appseo-*.sql.gz' -mtime +"$DIAS" -delete

copias=$(find "$DESTINO" -name 'appseo-*.sql.gz' | wc -l)

echo "$(date +'%F %T')  $archivo  $((tam / 1024)) KB  ·  $copias copias guardadas"
