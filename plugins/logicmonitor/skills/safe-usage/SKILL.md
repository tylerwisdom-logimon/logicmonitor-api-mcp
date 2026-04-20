# safe-usage

## Purpose
Use this skill to keep LogicMonitor tool use deliberate, evidence-based, and low-risk. It is the guardrail skill for reading first, confirming writes, and avoiding accidental batch blast radius.

## Read-first workflow
Start by checking the repository guidance and the server-side session or field hints before acting. The repo encourages reading the relevant health or session context so you can reuse existing results, confirm valid field names, and avoid duplicate list calls.

Treat the available tools as a workflow set, not a menu of interchangeable actions. The server exposes resource management, device metrics, batch operations, and session helpers, and each response is meant to include the raw payload plus request metadata so you can verify what actually happened. Pick the smallest operation that answers the question, then verify the result against the returned payload and session context.

## Write confirmation rules
For create, update, delete, or other state-changing work, confirm the target, the intended scope, and the expected effect before running the change. If the user has not clearly described the desired outcome, ask a brief clarifying question instead of guessing.

If a tool call depends on prior results, confirm that the session state still reflects the objects you intend to touch before you write anything.

## Batch-risk rules
Batch operations should be treated as high-impact even when the underlying action seems routine. Always verify the filter, the scope, and the resulting set before proceeding, and prefer reusing stored session handles when the repo has already captured them.

Do not expand a batch beyond the user’s request just because more targets are available. If the blast radius is unclear, stop and narrow it first.

## Verification expectations
Check the returned payload after each important action and compare it with what you expected to happen. When the repo offers a dedicated session or history view, use it to verify the change, confirm reuse of prior results, and make follow-up actions safer.

## Out of scope
This skill does not repeat resource-by-resource tool syntax, parameter tables, or exact endpoint inventories. It also does not replace the repo docs for installation, launcher setup, or listener-auth behavior.

## Truth sources
- `README.md`
- `tests/README.md`
- `AGENTS.md`
- `src/server.ts`
