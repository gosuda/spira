# Contribution guide

This file tells a contributor how to land a change in spira.
The [module conventions](AGENTS.md) hold the rules of the code.
The [specifications](docs/specs/README.md) hold the contract of each package.

## Set up

1. Follow [AGENTS.md](AGENTS.md), section "Toolchain environment". It names the LoGOs worktree that serves as the toolchain and gives the export line.
2. Every `just` recipe sets the toolchain environment. Set `LOGOS_ROOT` to use a different worktree root.
3. The `web` gate needs `pnpm`. Run `pnpm --dir frontend install --frozen-lockfile` once, or run `just web`.
4. Read [AGENTS.md](AGENTS.md) before your first change. Load the logos skills that it names.
5. Read the specification of the package that you touch under `docs/specs/`.
6. Install the pre-commit hook. Git does not copy hooks with a clone. Write this file as `.git/hooks/pre-commit` and make it executable:

   ```sh
   #!/usr/bin/env bash
   set -euo pipefail
   cd "$(git rev-parse --show-toplevel)"
   exec just gate
   ```

## Work on a change

1. Survey two or more clones under `.references/` before a new exported name. See the design procedure in [AGENTS.md](AGENTS.md).
2. Write the caller file first. It MUST fail to build for the missing names only.
3. Write the new test for a behavior change. Run it before the change. The run MUST fail. Keep the output.
4. Make the change. Run the test again. The run MUST pass.
5. Run `just gate` before every commit. The hook `.git/hooks/pre-commit` runs the same gate and stops the commit when it fails.
6. Run `just eject` at the end of the unit of work. An eject failure is a finding. See "Findings".
7. Engine tests run in Docker containers. Use `scripts/engines.sh <command>` to run a command with the engine DSNs set. The script pins each image by digest and removes its containers on exit.

## Commits

1. Write the subject as a capitalized imperative line of up to 72 characters.
2. Write a body that says what changed and why.
3. Put one concern in each commit.
4. Name each copied source in the body: the repository, the path and the revision. See [AGENTS.md](AGENTS.md), section "Copying from the reference clones".
5. Record each copied project once in `NOTICE`.

## Findings

A finding is a disagreement between the toolchain and `logos-doc/SPEC.md`, a crash, a miscompile, a misleading diagnostic, a missing form, or an eject output that differs from the native build.
The full protocol is in [AGENTS.md](AGENTS.md), section "Finding protocol".
The short form:

1. Search the issues, the pull requests and the main branch of `gosuda/loGos` first. Record the queries and the date in the draft.
2. Reduce the fault to one `.lgo` file. Add one control file that differs in one construct and does not show the fault.
3. Classify the finding as a defect or an enhancement.
4. A defect gets a test in a LoGOs fix worktree, placed where that worktree's `AGENTS.md` says. Run it. It MUST fail. Then fix the toolchain and run it again. It MUST pass.
5. An enhancement gets no compiler change. Write spira with the plain form that the current compiler accepts. Write the draft in the same step.
6. Keep each draft under `spira/.outline/findings/` as `<nn>-<slug>.md`. Send nothing outward without the approval of the user.
7. When the fix lands and the toolchain rebuilds, remove the workaround. The spira code uses the form that the SPEC promises.
