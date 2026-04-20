# setup-and-doctor

## When to use this skill
Use this skill when you need to confirm the LogicMonitor Codex plugin is wired correctly in this fork, especially after a fresh clone, a build, a launcher change, or a listener-auth setup change.

## Mode selection
Prefer the source checkout workflow for this fork when you need the listener-backed local Codex path or session-backed surfaces such as LM Logs. Use the published npm path only when you are intentionally testing the upstream-style bearer-token flow.

## Preflight sequence
Start from the repo root and confirm the local checkout is the active workspace. Then verify the project instructions in `AGENTS.md`, the main usage notes in `README.md`, the local launcher in `scripts/start-logicmonitor-mcp.sh`, and the test guidance in `tests/README.md`.

After that, check that dependencies are installed, the build output exists, and the launcher points at the current checkout instead of an old scratch path.

## Launcher validation
Validate that the launcher script is the one Codex should use for local stdio runs and that it expects a built `dist/index.js` plus an ignored `.env.codex.local` file. In listener mode, the launcher should reject bearer-token env vars and require a session listener URL.

## When to stop and ask the user
Stop and ask before changing the auth model, moving the launcher to a different checkout, or broadening the setup beyond this fork. Also pause if the launcher still points at an unexpected path, the build artifact is missing, or the session listener details are not known.

## Truth sources
- `README.md`
- `AGENTS.md`
- `scripts/start-logicmonitor-mcp.sh`
- `tests/README.md`
