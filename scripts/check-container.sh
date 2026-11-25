#!/usr/bin/env bash
set -euo pipefail

image=${1:-unraid-launcher:check}
container="launcher-check-${RANDOM}"
volume="launcher-check-${RANDOM}"
data_mount=${CHECK_BIND_DIR:-$volume}
user_args=()
if [[ -n "${CHECK_USER:-}" ]]; then user_args=(--user "$CHECK_USER"); fi
cleanup() {
  docker logs "$container" 2>/dev/null || true
  docker rm -f "$container" >/dev/null 2>&1 || true
  if [[ -z "${CHECK_BIND_DIR:-}" ]]; then docker volume rm "$volume" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT
if [[ -z "${CHECK_BIND_DIR:-}" ]]; then docker volume create "$volume" >/dev/null; fi
start() {
  docker run -d --name "$container" \
    --env DEMO_MODE=true --env UNRAID_URL=http://unraid.example.test \
    --publish 127.0.0.1::3000 --volume "$data_mount:/data" "${user_args[@]}" \
    --security-opt=no-new-privileges:true --cap-drop=ALL \
    "$image" >/dev/null
  address="http://$(docker port "$container" 3000/tcp)"
  for attempt in $(seq 1 30); do
    if curl --fail --silent "$address/api/health" >/dev/null; then return; fi
    sleep 1
  done
  echo 'Container did not become ready.' >&2
  return 1
}
start
test "$(docker exec "$container" id -u)" != 0
curl --fail --silent "$address/" | python3 -c 'import sys; assert "<html" in sys.stdin.read().lower()'
python3 - "$address" <<'PY'
import json, sys, urllib.request
with urllib.request.urlopen(sys.argv[1] + '/api/dashboard') as response:
    dashboard = json.load(response)
assert dashboard['connection']['demo'] is True
assert dashboard['containers'], 'Demo discovery returned no containers'
layout = dashboard['layout']
layout['groups'] = []
layout['favorites'] = ['container:Plex']
request = urllib.request.Request(sys.argv[1] + '/api/layout',
    data=json.dumps(layout).encode(), headers={'Content-Type': 'application/json'}, method='PUT')
with urllib.request.urlopen(request) as response:
    assert response.status == 200
PY
docker rm -f "$container" >/dev/null
start
curl --fail --silent "$address/api/dashboard" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["layout"]["favorites"] == ["container:Plex"], "Saved favourites did not survive recreation"'
echo 'Container serves the app, runs without root, and preserves favourites across recreation.'
