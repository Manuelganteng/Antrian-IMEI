#!/bin/sh
set -eu
# A new persistent volume is owned by root. Only the data directory needs ownership setup.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /data
  chown node:node /data
  exec gosu node "$@"
fi
exec "$@"
