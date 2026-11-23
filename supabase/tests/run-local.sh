#!/usr/bin/env bash
# Runs the migration and RLS tests against a throwaway local Postgres (no Docker needed).
# Supabase's auth schema and API roles are stubbed by supabase/tests/stub-auth.sql.
set -euo pipefail
cd "$(dirname "$0")/../.."
PGBIN=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}
DIR=$(mktemp -d)
# Postgres refuses to run as root; in containers, run the server as an unprivileged user.
RUN=()
if [ "$(id -u)" = 0 ]; then chown nobody "$DIR"; chmod 755 "$DIR"; RUN=(runuser -u nobody --); fi
PORT=${PGPORT:-54329}
trap '"${RUN[@]}" "$PGBIN/pg_ctl" -D "$DIR" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
"${RUN[@]}" "$PGBIN/initdb" -D "$DIR" -U postgres --auth=trust >/dev/null
"${RUN[@]}" "$PGBIN/pg_ctl" -D "$DIR" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" start >/dev/null
PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -c 'create database chakra' >/dev/null
"${PSQL[@]}" -d chakra -f supabase/tests/stub-auth.sql
"${PSQL[@]}" -d chakra -f supabase/migrations/20261123000001_init.sql
"${PSQL[@]}" -d chakra -o /dev/null -f supabase/tests/rls.test.sql
echo "Database tests passed"
