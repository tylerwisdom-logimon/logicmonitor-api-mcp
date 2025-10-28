## 1.2.0 – 2025-10-28

### Highlights
- Migrated the project to the new `@modelcontextprotocol/sdk` server layer. `src/index.ts` now hosts both STDIO and HTTP transports backed by a shared `createServer` helper, while `src/server.ts` exposes richer instructions, session-aware behaviour, and centralized error logging.
- Added a session framework (`src/session/sessionManager.ts`) and a suite of `lm_*_session_*` tools so assistants can store/retrieve variables, inspect history, and manage session state within a conversation.
- Overhauled the LogicMonitor client (`src/api/client.ts`): every call now returns raw API payloads plus structured metadata (request details, timing, rate-limit headers). LogicMonitor-specific failures are normalized through the new `LogicMonitorApiError` class.
- Introduced per-tool success/failure metrics recorded by `src/metrics/metricsManager.ts` and surfaced through the MCP resource `health://logicmonitor/status` for health monitoring.
- Expanded and hardended all tool handlers (devices, device groups, websites, website groups, collectors, alerts). They now validate input with JOI schemas, leverage the shared `batchProcessor`, store session context, and provide consistent raw responses for both single and batch operations.

### Field Metadata & Validation
- Added Swagger-driven field metadata resources (`health://logicmonitor/fields/<resource>`) so agents can discover valid field names for each LogicMonitor entity. Tool descriptions reference these URIs, and the server instructions highlight where to find them.
- All list/get tools validate requested fields against the Swagger definitions using `sanitizeFields`; invalid names produce clear MCP errors before an API call is issued.
- A lightweight utility (`tests/test-field-metadata.js`) prints the known field lists and verifies the validation logic against the compiled build.

### Quality & Developer Experience
- Standardised batch error handling via the reusable `throwBatchFailure` helper, ensuring detailed diagnostics (status, code, request IDs) flow into metrics and agent responses.
- Documentation (`README.md`) now reflects the raw-response contract, request metadata, health resources, and instructions for retrieving field lists.
- Numerous TypeScript typing improvements across tools keep local casts honest while still returning raw payloads to the caller.
