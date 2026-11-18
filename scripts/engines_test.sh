#!/usr/bin/env bash
# engines_test.sh: prove scripts/engines.sh without spira code.
#  1. engines.sh runs a command that checks the three DSNs, their ports,
#     that spira_test exists in each engine, and records the mounts of
#     each container by inspect while they run (one inspected line per
#     container, one volume line per mount).
#  2. After engines.sh returns, no spira-engines- container is left and
#     none of the recorded volumes is left. The postgres and mysql
#     containers must each show a volume; the mssql container may not.
#  3. engines.sh false exits nonzero and leaves no container.
#  4. engines.sh with no argument exits 2.
#  5. With SPIRA_ENGINES_MSSQL_IMAGE pointing at busybox (its default command
#     exits at once), engines.sh true fails fast, names the exit code and
#     leaves no container.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly ENGINES="$SCRIPT_DIR/engines.sh"

fail() {
	printf 'engines_test.sh: FAIL: %s\n' "$*" >&2
	exit 1
}

command -v docker >/dev/null 2>&1 || fail 'docker is required'

leftovers() {
	docker ps -a --filter name=spira-engines- --format '{{.Names}}'
}

# The volumes to check are the mounts of the three engine containers.
# CHECKS records them by inspect while the containers run, one
# "inspected <container>" line per container and one
# "volume <container> <name>" line per mount, so a mounted volume
# cannot be missed the way a late docker events listener missed one.
volumes_list="$(mktemp)"
cleanup_files() {
	rm -f "$volumes_list"
}
trap cleanup_files EXIT

inspected() {
	grep -q "^inspected spira-engines-$1-" "$volumes_list"
}

kind_volumes() {
	awk -v kind="spira-engines-$1-" '$1 == "volume" && index($2, kind) == 1 { print $3 }' "$volumes_list"
}

recorded_volumes() {
	awk '$1 == "volume" { print $3 }' "$volumes_list"
}

leaked_volumes() {
	local volume
	recorded_volumes | while IFS= read -r volume; do
		[ -n "$volume" ] || continue
		if docker volume inspect "$volume" >/dev/null 2>&1; then
			printf '%s\n' "$volume"
		fi
	done
}

# --- 1. DSNs, ports and spira_test in each engine ---
VOLUMES_FILE="$volumes_list"
export VOLUMES_FILE
"$ENGINES" bash -s <<'CHECKS'
set -euo pipefail
: "${SPIRA_TEST_POSTGRES_DSN:?missing}"
: "${SPIRA_TEST_MYSQL_DSN:?missing}"
: "${SPIRA_TEST_MSSQL_DSN:?missing}"
: "${SPIRA_PG_CONTAINER:?missing}"
: "${SPIRA_MYSQL_CONTAINER:?missing}"
: "${SPIRA_MSSQL_CONTAINER:?missing}"

pg_port="${SPIRA_TEST_POSTGRES_DSN##*@127.0.0.1:}"
pg_port="${pg_port%%/*}"
my_port="${SPIRA_TEST_MYSQL_DSN##*@tcp(127.0.0.1:}"
my_port="${my_port%%)*}"
ms_port="${SPIRA_TEST_MSSQL_DSN##*@127.0.0.1:}"
ms_port="${ms_port%%[/?]*}"

port_open() {
	(exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}
port_open "$pg_port" || { printf 'postgres published port %s refused the connection\n' "$pg_port" >&2; exit 1; }
port_open "$my_port" || { printf 'mysql published port %s refused the connection\n' "$my_port" >&2; exit 1; }
port_open "$ms_port" || { printf 'sqlserver published port %s refused the connection\n' "$ms_port" >&2; exit 1; }

docker exec "$SPIRA_PG_CONTAINER" psql -U postgres -d postgres -tAc \
	"SELECT 1 FROM pg_database WHERE datname='spira_test'" | grep -qx 1

docker exec "$SPIRA_MYSQL_CONTAINER" mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -NBe \
	"SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='spira_test'" | grep -qx 1

docker exec "$SPIRA_MSSQL_CONTAINER" sh -c \
	'/opt/mssql-tools18/bin/sqlcmd -C -S 127.0.0.1,1433 -U sa -P "$MSSQL_SA_PASSWORD" -b -h -1 -W -Q "SET NOCOUNT ON; SELECT name FROM sys.databases WHERE name='"'"'spira_test'"'"'"' | grep -qx spira_test

for container in "$SPIRA_PG_CONTAINER" "$SPIRA_MYSQL_CONTAINER" "$SPIRA_MSSQL_CONTAINER"; do
	if ! mounts="$(docker inspect --format '{{range .Mounts}}{{.Name}}{{"\n"}}{{end}}' "$container")"; then
		printf 'inspect of %s failed\n' "$container" >&2
		exit 1
	fi
	printf 'inspected %s\n' "$container"
	printf '%s\n' "$mounts" | while IFS= read -r name; do
		[ -n "$name" ] || continue
		printf 'volume %s %s\n' "$container" "$name"
	done
done >"$VOLUMES_FILE"
CHECKS

for kind in postgres mysql mssql; do
	if ! inspected "$kind"; then
		fail "no inspect record for the spira-engines-$kind container"
	fi
done
for kind in postgres mysql; do
	if [ -z "$(kind_volumes "$kind")" ]; then
		fail "no volume recorded for the spira-engines-$kind container"
	fi
done
[ -z "$(leaked_volumes)" ] || fail "docker volumes of the engine containers left: $(leaked_volumes)"

[ -z "$(leftovers)" ] || fail "containers left after success: $(leftovers)"
printf 'engines_test.sh: PASS: DSNs, ports and spira_test verified; volumes recorded and removed\n'

# --- 2. failure propagates and cleans up ---
if "$ENGINES" false; then
	fail 'engines.sh false exited 0'
fi
[ -z "$(leftovers)" ] || fail "containers left after failure: $(leftovers)"
printf 'engines_test.sh: PASS: nonzero exit propagates and containers removed\n'

# --- 3. no argument exits 2 ---
rc=0
"$ENGINES" >/dev/null 2>&1 || rc=$?
[ "$rc" -eq 2 ] || fail "engines.sh with no argument exited $rc, want 2"
[ -z "$(leftovers)" ] || fail "containers left after usage: $(leftovers)"
printf 'engines_test.sh: PASS: no-argument usage exits 2\n'

# --- 4. an mssql image that exits at once fails fast ---
docker pull busybox:latest >/dev/null || fail 'busybox pull failed'
rc=0
SECONDS=0
ms_log="$(env SPIRA_ENGINES_MSSQL_IMAGE=busybox:latest "$ENGINES" true 2>&1)" || rc=$?
elapsed=$SECONDS
[ "$rc" -ne 0 ] || fail 'engines.sh true with fast-exit mssql image exited 0'
[ "$elapsed" -lt 90 ] || fail "engines.sh true took ${elapsed}s to fail, want under 90"
printf '%s\n' "$ms_log" | grep -q 'exit code' || fail "failure output names no exit code: $ms_log"
[ -z "$(leftovers)" ] || fail "containers left after fast-fail: $(leftovers)"
printf 'engines_test.sh: PASS: fast-exit mssql image failed in %ss, exit code reported, no containers left\n' "$elapsed"

[ -z "$(leaked_volumes)" ] || fail "docker volumes of the engine containers left after all runs: $(leaked_volumes)"

printf 'engines_test.sh: all checks passed\n'
