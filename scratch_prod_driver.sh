#!/bin/bash
# Sweep prod instances via per-instance SSH tunnel. Read-only.
set -u
cd /Users/timroberton/projects/apps/wb-fastr
set -a; . ./.env 2>/dev/null; set +a   # load local env so server modules import

PW=$(ssh wb-server 'docker exec nigeria-postgres printenv POSTGRES_PASSWORD' 2>/dev/null)
LOCALPORT=15555

# instance:remoteport list (subset or all). Passed as $@ like "nigeria:19105"
for spec in "$@"; do
  name="${spec%%:*}"; rport="${spec##*:}"
  pkill -f "ssh -f -N -L ${LOCALPORT}:localhost" 2>/dev/null
  ssh -f -N -L ${LOCALPORT}:localhost:${rport} wb-server
  sleep 1
  if ! nc -z localhost ${LOCALPORT} 2>/dev/null; then echo "[$name] tunnel FAILED"; continue; fi
  deno run --allow-all -c deno.json scratch_prod_sweep.ts localhost ${LOCALPORT} "$PW" "$name" 2>&1
  pkill -f "ssh -f -N -L ${LOCALPORT}:localhost" 2>/dev/null
done
