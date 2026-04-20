#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -n "${LOGICMONITOR_PLUGIN_CHECKOUT_ROOT:-}" ]]; then
  PROJECT_ROOT="$(cd "$LOGICMONITOR_PLUGIN_CHECKOUT_ROOT" && pwd)"
else
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
fi

MODE="${LOGICMONITOR_PLUGIN_MODE:-auto}"
STDIO_ENTRYPOINT="$PROJECT_ROOT/dist/index.js"
LOCAL_LAUNCHER="$PROJECT_ROOT/scripts/start-logicmonitor-mcp.sh"

run_standard() {
  if [[ -f "$STDIO_ENTRYPOINT" ]]; then
    exec node "$STDIO_ENTRYPOINT" --stdio
  fi

  if command -v npx >/dev/null 2>&1; then
    exec npx -y logicmonitor-api-mcp --stdio
  fi

  echo "[fail] Standard mode needs $STDIO_ENTRYPOINT or a working npx installation." >&2
  exit 1
}

run_advanced_local() {
  if [[ ! -x "$LOCAL_LAUNCHER" ]]; then
    echo "[fail] Advanced local mode expects $LOCAL_LAUNCHER to exist and be executable." >&2
    exit 1
  fi

  exec "$LOCAL_LAUNCHER"
}

select_auto_mode() {
  if [[ -n "${LM_SESSION_LISTENER_BASE_URL:-}" ]]; then
    echo advanced-local
    return
  fi

  local env_file="${LM_CODEX_ENV_FILE:-$PROJECT_ROOT/.env.codex.local}"
  if [[ "$env_file" != /* ]]; then
    env_file="$PROJECT_ROOT/$env_file"
  fi

  if [[ -f "$env_file" ]] && grep -q '^LM_SESSION_LISTENER_BASE_URL=' "$env_file"; then
    echo advanced-local
    return
  fi

  echo standard
}

case "$MODE" in
  auto)
    MODE="$(select_auto_mode)"
    ;;
  standard|advanced-local)
    ;;
  *)
    echo "[fail] LOGICMONITOR_PLUGIN_MODE must be auto, standard, or advanced-local." >&2
    exit 1
    ;;
esac

case "$MODE" in
  standard)
    run_standard
    ;;
  advanced-local)
    run_advanced_local
    ;;
esac
