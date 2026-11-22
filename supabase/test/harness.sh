#!/usr/bin/env bash
# Applies the migrations to a throwaway Postgres in Docker and runs the acceptance checks in checks.sql.
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=gh26-sqltest
docker rm -f $NAME >/dev/null 2>&1 || true
docker run -d --name $NAME -e POSTGRES_PASSWORD=pw postgres:16 >/dev/null
trap 'docker rm -f $NAME >/dev/null 2>&1 || true' EXIT
until docker exec $NAME pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
sleep 2
run() { docker exec -i $NAME psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
run < test/stub_auth.sql
for f in migrations/*.sql seed_dev.sql; do echo "== $f"; run < "$f"; done
echo "== checks"; run < test/checks.sql
