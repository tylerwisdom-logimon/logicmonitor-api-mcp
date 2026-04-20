# AGENTS.md

## Scope

This repository is maintained as the fork `tylerwisdom-logimon/logicmonitor-api-mcp` and tracks upstream `logicmonitor/logicmonitor-api-mcp`.

- Keep fork-specific changes intentionally narrow so upstream pulls and rebases stay practical.
- Prefer additive seams in `src/auth/`, `src/api/`, `src/session/`, `src/server.ts`, and tool/schema registration over broad refactors.
- Preserve existing bearer-token behavior unless the task explicitly changes it.
- Do not commit secrets, user-specific paths, `.env` variants with credentials, `node_modules/`, or generated `dist/` output.

## Repository Map

- `src/index.ts`: process entrypoint and transport startup.
- `src/server.ts`: MCP server creation, tool registration, session wiring, and request dispatch.
- `src/auth/`: MCP auth, LogicMonitor credential resolution, and listener-mode portal selection.
- `src/api/`: outbound LogicMonitor client and listener-backed session helpers.
- `src/resources/`: per-resource handlers and Zod schemas.
- `src/session/`: session storage plus portal-scoped session helpers.
- `tests/unit/`: fastest regression coverage for auth, session, client, and resource behavior.
- `scripts/start-logicmonitor-mcp.sh`: local Codex stdio launcher for this checkout.

## Setup And Commands

- Install dependencies: `npm install`
- Build: `npm run build`
- Lint: `npm run lint`
- Full test suite: `npm test`
- Dev server: `npm run dev`

## Focused Verification

- For listener auth, session management, or multi-portal routing changes, run:

  ```bash
  npm test -- --runTestsByPath \
    tests/unit/auth/lmCredentials.test.ts \
    tests/unit/auth/credentialMapper.test.ts \
    tests/unit/auth/portalResolution.test.ts \
    tests/unit/api/sessionAuth.test.ts \
    tests/unit/api/client.session.test.ts \
    tests/unit/server/multiPortalSessionIsolation.test.ts
  ```

- When public behavior changes, update `README.md` and relevant tests in the same patch.
- If you cannot run a check, say so explicitly in your summary.

## Fork Workflow

- `origin` should point at the fork: `git@github.com:tylerwisdom-logimon/logicmonitor-api-mcp.git`
- Add `upstream` for official syncs: `git@github.com:logicmonitor/logicmonitor-api-mcp.git`
- Before broad refactors, stop and ask whether the upstream merge cost is worth it.
- When syncing upstream, inspect auth, session, client, launcher, and README changes carefully because the fork-specific behavior lives there.

## Codex Workflow

- Start Codex from the repository root so this file loads automatically.
- Verify active instructions with:

  ```bash
  codex --ask-for-approval never "Summarize the current instructions."
  ```

- If the instructions look stale, restart Codex in this repository. Codex rebuilds the instruction chain at startup.
- Use `scripts/start-logicmonitor-mcp.sh` with an ignored `.env.codex.local` file for local stdio integration.
- In listener mode, explicit tool `portal` wins over `lm_session` key `defaultPortal`, which wins over `LM_PORTAL`.

## Done Means

- The change builds cleanly.
- Relevant tests or lint checks have been run.
- The diff has been reviewed for regressions and unnecessary upstream divergence.
- User-facing behavior, configuration, or workflow changes are documented in `README.md`.
