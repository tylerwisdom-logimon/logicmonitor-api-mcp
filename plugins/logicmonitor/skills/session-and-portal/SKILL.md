# session-and-portal

## When to use
Use this skill when a task depends on listener-backed session auth, selecting the correct LogicMonitor portal, understanding how portal-scoped session state is reused across calls, or working with session-backed surfaces such as LM Logs.

## Portal precedence
In listener mode, portal selection follows this order: an explicit tool portal first, then the session default portal stored in `lm_session`, and then the configured fallback portal from `LM_PORTAL`.

## How to inspect lm_session
Use `lm_session get` to inspect the active session state when you need to confirm the current default portal, the list of available portals, or the portal-scoped state that has already been recorded for this conversation.

If you need a fuller picture of recent operations, inspect the session history before repeating a query or starting a follow-up write.

## Multi-portal workflow
When more than one portal is available, treat the portal as part of the working context for the request. Reuse the session default when it is correct, otherwise pass the target portal explicitly and let the session state record the portal-specific scope for later reuse.

## Failure modes
If no portal can be resolved, the issue is usually missing listener context, a missing session default portal, or a missing fallback portal configuration. If a portal exists but no active session is loaded, refresh the target LogicMonitor portal page while the listener is running and try again.

If the listener endpoint cannot return portals or a portal session, treat that as an auth or listener problem rather than a LogicMonitor resource problem.

## What this skill must not redefine
Do not restate the low-level session schema or resource-specific call shapes here. This skill only explains portal choice, session inspection, and the expected listener-backed workflow.

LM Logs remains outside bearer-only mode in this phase, so this skill should point readers back to the advanced local listener-backed workflow instead of trying to describe bearer-only access to it.

## Truth sources
- `README.md` listener-backed workflow and listener-mode notes
- `AGENTS.md` portal precedence rule
- `src/auth/portalResolution.ts`
- `src/api/sessionAuth.ts`
- `src/session/portalSessionState.ts`
