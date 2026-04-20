# What this plugin is

This plugin is a thin Codex wrapper for the LogicMonitor MCP server. The MCP server remains the source of truth for tools, auth behavior, and portal-scoped session state.

# Mode Summary

The plugin supports two working modes. `Standard` is the default shareable path and is bearer-token-first. `Advanced local` is for repo-checkout workflows, uses the local listener-backed launcher, and unlocks session-backed surfaces such as LM Logs.

# Standard Mode

Use Standard mode when you want the simplest MCP setup. Point Codex at the MCP server through the plugin manifest and let the server resolve LogicMonitor access from bearer credentials first.

This mode does not expose LM Logs in the current phase because LM Logs depends on listener-backed session context rather than bearer-only access.

# Advanced Local Mode

Use Advanced local mode for this forked checkout. It delegates to `scripts/start-logicmonitor-mcp.sh`, which is the local stdio launcher for listener-backed sessions. That launcher expects `LM_SESSION_LISTENER_BASE_URL` and keeps this repository as the active runtime source.

Advanced local is the right place to reach session-backed capabilities like LM Logs.

# Doctor Workflow

When something looks off, verify the runtime path, confirm the launcher script is being used, and check whether the listener base URL and portal context are set the way you expect. If the plugin and the server disagree, trust the server-side behavior and fix the launcher or environment instead of duplicating logic in the plugin.

# What Stays Authoritative In The MCP Server

Tool schemas, auth rules, portal resolution, session storage, and request handling stay authoritative in the MCP server. This plugin only declares how Codex should reach the server and how to describe the two supported modes.
