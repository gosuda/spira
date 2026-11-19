#!/usr/bin/env bash
set -euo pipefail

readonly POSTGRES_IMAGE='pgvector/pgvector@sha256:38681dc6eaf55308e2a4c6de392d131652dcfac70e1263e35cd9b5ea3fe39782' # pgvector/pgvector:pg18 (PostgreSQL 18.7, vector 0.8.7)
readonly MYSQL_IMAGE='mysql@sha256:df90258da46f6e7ff8574ff84f17618aba0765cac749928299c69fd4e7cb8ad8'     # mysql:9.7.4
readonly MSSQL_IMAGE_DEFAULT='mcr.microsoft.com/mssql/server@sha256:4525e3efac9f3e241cb003bb2ff2a82818b502f37e12049d788b1a9fa7e13b7f' # 2022-latest; 2025-latest crashes on this kernel, see scripts report
readonly MSSQL_IMAGE="${SPIRA_ENGINES_MSSQL_IMAGE:-$MSSQL_IMAGE_DEFAULT}"

if ! command -v docker >/dev/null 2>&1; then
	printf 'engines.sh: docker is required but not found on PATH\n' >&2
	exit 127
fi

if (( $# == 0 )); then
	printf 'usage: %s <command> [args...]\n' "$0" >&2
	printf '  SPIRA_ENGINES_MSSQL_IMAGE=<ref> overrides the SQL Server image\n' >&2
	exit 2
fi

readonly PG_NAME="spira-engines-postgres-$$"
readonly MY_NAME="spira-engines-mysql-$$"
readonly MS_NAME="spira-engines-mssql-$$"

cleanup() {
	docker rm -fv "$PG_NAME" "$MY_NAME" "$MS_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

container_port() {
	local name="$1" container_port="$2" mapping
	mapping="$(docker port "$name" "$container_port" | head -n 1)"
	printf '%s\n' "${mapping##*:}"
}

container_state() {
	docker inspect -f '{{.State.Status}}/{{.State.ExitCode}}' "$1" 2>/dev/null || true
}

wait_ready() {
	local name="$1" deadline="$2" probe_desc="$3"
	shift 3
	local deadline_epoch state
	deadline_epoch=$(( $(date +%s) + deadline ))
	while :; do
		state="$(container_state "$name")"
		if [[ -z "$state" ]]; then
			printf 'engines.sh: %s no longer exists while waiting for readiness (%s)\n' "$name" "$probe_desc" >&2
			return 1
		fi
		case "$state" in
		exited/* | dead/*)
			printf 'engines.sh: %s state %s, exit code %s, before becoming ready (%s)\n' \
				"$name" "${state%%/*}" "${state#*/}" "$probe_desc" >&2
			docker logs --tail 20 "$name" >&2 || true
			return 1
			;;
		esac
		if "$@"; then
			return 0
		fi
		if (( $(date +%s) >= deadline_epoch )); then
			break
		fi
		sleep 2
	done
	printf 'engines.sh: %s did not become ready within %ss (%s)\n' "$name" "$deadline" "$probe_desc" >&2
	docker logs --tail 20 "$name" >&2 || true
	return 1
}

POSTGRES_PASSWORD="$(openssl rand -hex 16)"
readonly POSTGRES_PASSWORD
export POSTGRES_PASSWORD
docker run -d --name "$PG_NAME" \
	-e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
	-e POSTGRES_DB=spira_test \
	-p 127.0.0.1::5432 \
	"$POSTGRES_IMAGE" >/dev/null

wait_ready "$PG_NAME" 120 'pg_isready' \
	docker exec "$PG_NAME" pg_isready -U postgres -d spira_test

PG_PORT="$(container_port "$PG_NAME" 5432/tcp)"

MYSQL_ROOT_PASSWORD="$(openssl rand -hex 16)"
readonly MYSQL_ROOT_PASSWORD
export MYSQL_ROOT_PASSWORD
docker run -d --name "$MY_NAME" \
	-e MYSQL_ROOT_PASSWORD="$MYSQL_ROOT_PASSWORD" \
	-e MYSQL_DATABASE=spira_test \
	-p 127.0.0.1::3306 \
	"$MYSQL_IMAGE" >/dev/null

# shellcheck disable=SC2016 # the single-quoted command is expanded by the container's sh
wait_ready "$MY_NAME" 120 'SELECT 1 through mysql client' \
	docker exec "$MY_NAME" sh -c \
		'mysqladmin ping -h 127.0.0.1 -uroot -p"$MYSQL_ROOT_PASSWORD" --silent >/dev/null 2>&1 && mysql -h 127.0.0.1 -uroot -p"$MYSQL_ROOT_PASSWORD" -NBe "SELECT 1" >/dev/null 2>&1'

MY_PORT="$(container_port "$MY_NAME" 3306/tcp)"

MSSQL_SA_PASSWORD="$(openssl rand -hex 8)Aa1"
readonly MSSQL_SA_PASSWORD
export MSSQL_SA_PASSWORD
# sqlservr on this kernel exits 139 during startup; each attempt is one full start-and-wait.
readonly MSSQL_RUN_ATTEMPTS=5
ms_ready=0
for (( ms_attempt = 1; ms_attempt <= MSSQL_RUN_ATTEMPTS; ms_attempt++ )); do
	if ! docker run -d --name "$MS_NAME" \
		-e ACCEPT_EULA=Y \
		-e MSSQL_SA_PASSWORD="$MSSQL_SA_PASSWORD" \
		-p 127.0.0.1::1433 \
		"$MSSQL_IMAGE" >/dev/null; then
		printf 'engines.sh: %s attempt %d/%d: docker run failed\n' "$MS_NAME" "$ms_attempt" "$MSSQL_RUN_ATTEMPTS" >&2
		continue
	fi
	# shellcheck disable=SC2016 # the single-quoted command is expanded by the container's sh
	if wait_ready "$MS_NAME" 120 'SELECT 1 through sqlcmd' \
		docker exec "$MS_NAME" sh -c \
			'/opt/mssql-tools18/bin/sqlcmd -C -S 127.0.0.1,1433 -U sa -P "$MSSQL_SA_PASSWORD" -b -Q "SELECT 1" >/dev/null 2>&1'; then
		ms_ready=1
		break
	fi
	printf 'engines.sh: %s attempt %d/%d failed (state: %s)\n' \
		"$MS_NAME" "$ms_attempt" "$MSSQL_RUN_ATTEMPTS" "$(container_state "$MS_NAME")" >&2
	docker rm -fv "$MS_NAME" >/dev/null 2>&1 || true
done
if (( ms_ready == 0 )); then
	printf 'engines.sh: %s not ready after %d attempts\n' "$MS_NAME" "$MSSQL_RUN_ATTEMPTS" >&2
	exit 1
fi

# shellcheck disable=SC2016 # the single-quoted command is expanded by the container's sh
docker exec "$MS_NAME" sh -c \
	'/opt/mssql-tools18/bin/sqlcmd -C -S 127.0.0.1,1433 -U sa -P "$MSSQL_SA_PASSWORD" -b -Q "IF DB_ID('"'"'spira_test'"'"') IS NULL CREATE DATABASE spira_test" >/dev/null'

MS_PORT="$(container_port "$MS_NAME" 1433/tcp)"

export SPIRA_TEST_POSTGRES_DSN="postgres://postgres:${POSTGRES_PASSWORD}@127.0.0.1:${PG_PORT}/spira_test?sslmode=disable"
export SPIRA_TEST_MYSQL_DSN="root:${MYSQL_ROOT_PASSWORD}@tcp(127.0.0.1:${MY_PORT})/spira_test?parseTime=true&multiStatements=true"
export SPIRA_TEST_MSSQL_DSN="sqlserver://sa:${MSSQL_SA_PASSWORD}@127.0.0.1:${MS_PORT}?database=spira_test&encrypt=disable"
export SPIRA_PG_CONTAINER="$PG_NAME"
export SPIRA_MYSQL_CONTAINER="$MY_NAME"
export SPIRA_MSSQL_CONTAINER="$MS_NAME"

"$@"
