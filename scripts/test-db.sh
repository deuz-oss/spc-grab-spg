#!/usr/bin/env bash
# Apply every migration to a throwaway Postgres and run the smoke test.
# Needs PostgreSQL 15+ server binaries (initdb, pg_ctl) on PATH or in /usr/lib/postgresql/*/bin.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb | tail -1)")"
WORK="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
RUNAS=""
if [ "$(id -u)" = "0" ]; then RUNAS="runuser -u postgres --"; chown postgres "$WORK"; fi

cleanup() { $RUNAS "$PGBIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

$RUNAS "$PGBIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
$RUNAS "$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null

PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -d postgres -X -q -t -A -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f "$ROOT/supabase/tests/00_supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  case "$(basename "$f")" in *_storage.sql) echo "skip (Supabase-only): $(basename "$f")"; continue;; esac
  echo "apply: $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -f "$ROOT/supabase/tests/01_grants.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/10_smoke.sql" 2>&1 | grep -E "pass:|FAIL|ERROR|PASSED|apply|skip" | sed "s/^psql:[^:]*:[0-9]*: NOTICE:  /  /"
