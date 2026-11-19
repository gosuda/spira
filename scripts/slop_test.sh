#!/usr/bin/env bash
# slop_test.sh: prove the just slop gate bites and passes.
#  1. just slop exits 0 on the clean tree; minor findings do not fail the gate.
#  2. A temporary copy of the tree under TMPDIR holding one TypeScript file
#     with an unknown suppression rule makes just slop exit nonzero there,
#     and the output names the planted file and meta/invalid-suppression.
#  3. After the copy is removed, just slop on the clean tree exits 0 again.
# The plant lives in a copy because sloplint analyzes the project root and
# rejects paths outside it; the copy keeps the repository itself clean.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

fail() {
	printf 'slop_test.sh: FAIL: %s\n' "$*" >&2
	exit 1
}

command -v just >/dev/null 2>&1 || fail 'just is required'
command -v sloplint >/dev/null 2>&1 || fail 'sloplint is required'

slop_in() {
	(cd "$1" && just slop 2>&1)
}

# --- 1. clean tree passes ---
clean_out="$(slop_in "${ROOT}")" || fail "just slop on the clean tree exited nonzero: ${clean_out}"
printf '%s\n' "${clean_out}" | grep -q 'summary:' || fail "clean run shows no summary: ${clean_out}"
printf 'slop_test.sh: PASS: clean tree exits 0\n'

# --- 2. planted finding fails the recipe in a temporary copy ---
WORK="$(mktemp -d "${TMPDIR:-/tmp}/slop-test-XXXXXX")"
cleanup() {
	if [ -n "${WORK:-}" ] && [ -d "${WORK}" ]; then
		case "${WORK}" in
			"${TMPDIR:-/tmp}"/*|/tmp/*) rm -rf "${WORK}" ;;
			*) printf 'slop_test.sh: FAIL: refusing to remove %s\n' "${WORK}" >&2; exit 1 ;;
		esac
	fi
}
trap cleanup EXIT
mkdir -p "${WORK}/tree" "${WORK}/tree/tmp-slop-plant"
tar --exclude=.git --exclude=.outline -cf - -C "${ROOT}" . | tar -xf - -C "${WORK}/tree"
printf '// sloplint-allow(bogus/rule-name): slop_test.sh plants this to prove the gate bites\nexport const planted = 1;\n' >"${WORK}/tree/tmp-slop-plant/planted.ts"

rc=0
planted_out="$(slop_in "${WORK}/tree")" || rc=$?
[ "${rc}" -ne 0 ] || fail 'just slop with the planted finding exited 0'
printf '%s\n' "${planted_out}" | grep -q 'planted.ts' || fail "failure output names no planted file: ${planted_out}"
printf '%s\n' "${planted_out}" | grep -q 'meta/invalid-suppression' || fail "failure output names no meta/invalid-suppression rule: ${planted_out}"
printf 'slop_test.sh: PASS: planted finding exits %s and names planted.ts under meta/invalid-suppression\n' "${rc}"

# --- 3. removal restores the clean gate ---
rm -rf "${WORK}"
trap - EXIT
restored_out="$(slop_in "${ROOT}")" || fail "just slop after removing the plant exited nonzero: ${restored_out}"
printf '%s\n' "${restored_out}" | grep -q 'summary:' || fail "restored run shows no summary: ${restored_out}"
printf 'slop_test.sh: PASS: gate is green again after the plant is removed\n'

printf 'slop_test.sh: all checks passed\n'
