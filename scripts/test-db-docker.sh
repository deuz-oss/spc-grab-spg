#!/usr/bin/env bash
# Same as test-db.sh, for machines without PostgreSQL server binaries: runs it inside postgres:16.
# Only supabase/ and scripts/ are mounted (copying node_modules through a bind mount is slow), and CRLF
# line endings from a Windows checkout are stripped inside the container, never in the working tree.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST_ROOT="$ROOT"
command -v cygpath >/dev/null 2>&1 && HOST_ROOT="$(cygpath -w "$ROOT")"
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$HOST_ROOT/supabase:/src/supabase:ro" -v "$HOST_ROOT/scripts:/src/scripts:ro" postgres:16 bash -c '
    mkdir -p /tmp/r && cp -r /src/supabase /src/scripts /tmp/r/
    find /tmp/r -type f \( -name "*.sh" -o -name "*.sql" \) -exec sed -i "s/\r\$//" {} +
    chown -R postgres /tmp/r
    runuser -u postgres -- bash -c "export PATH=/usr/lib/postgresql/16/bin:\$PATH; cd /tmp && bash /tmp/r/scripts/test-db.sh"'
