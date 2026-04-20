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
ENV_FILE="${LM_CODEX_ENV_FILE:-$PROJECT_ROOT/.env.codex.local}"

if [[ "$ENV_FILE" != /* ]]; then
  ENV_FILE="$PROJECT_ROOT/$ENV_FILE"
fi

trim_quotes() {
  local value="$1"
  value="${value#\"}"
  value="${value%\"}"
  value="${value#\'}"
  value="${value%\'}"
  echo "$value"
}

selected_mode="$MODE"
if [[ "$selected_mode" == auto ]]; then
  if [[ -n "${LM_SESSION_LISTENER_BASE_URL:-}" ]]; then
    selected_mode="advanced-local"
  elif [[ -f "$ENV_FILE" ]] && grep -q '^LM_SESSION_LISTENER_BASE_URL=' "$ENV_FILE"; then
    selected_mode="advanced-local"
  else
    selected_mode="standard"
  fi
fi

ok() {
  echo "[ok] $1"
}

warn() {
  echo "[warn] $1"
}

fail() {
  echo "[fail] $1"
  return 1
}

standard_entrypoint="$PROJECT_ROOT/dist/index.js"
local_launcher="$PROJECT_ROOT/scripts/start-logicmonitor-mcp.sh"
plugin_launcher="$PLUGIN_ROOT/scripts/launch.sh"

ok "Plugin root: $PLUGIN_ROOT"
ok "Project root: $PROJECT_ROOT"
ok "Selected mode: $selected_mode (from LOGICMONITOR_PLUGIN_MODE=${MODE})"

if [[ -x "$plugin_launcher" ]]; then
  ok "Plugin launcher is executable: $plugin_launcher"
else
  fail "Plugin launcher is missing or not executable: $plugin_launcher"
fi

if [[ "$MODE" == standard || "$selected_mode" == standard ]]; then
  if [[ -n "${LM_ACCOUNT:-}" && -n "${LM_BEARER_TOKEN:-}" ]]; then
    ok "Standard mode bearer credentials are present: LM_ACCOUNT and LM_BEARER_TOKEN"
  else
    warn "Standard mode typically expects LM_ACCOUNT and LM_BEARER_TOKEN in the plugin environment."
  fi

  if [[ -f "$standard_entrypoint" ]]; then
    ok "Standard mode prefers packaged dist/index.js: $standard_entrypoint"
  elif command -v npx >/dev/null 2>&1; then
    warn "Standard mode will fall back to 'npx -y logicmonitor-api-mcp --stdio' because $standard_entrypoint is missing."
  else
    fail "Standard mode needs either $standard_entrypoint or a working npx installation."
  fi
else
  if [[ -f "$standard_entrypoint" ]]; then
    ok "Packaged stdio entrypoint is present for Standard mode: $standard_entrypoint"
  else
    warn "Packaged stdio entrypoint is missing; Standard mode would rely on npx fallback."
  fi
fi

if [[ "$MODE" == advanced-local || "$selected_mode" == advanced-local ]]; then
  if [[ -x "$local_launcher" ]]; then
    ok "Advanced local launcher is available: $local_launcher"
  else
    fail "Advanced local mode requires $local_launcher to exist and be executable."
  fi

  if [[ -f "$ENV_FILE" ]]; then
    ok "Advanced local env file is present: $ENV_FILE"
  else
    fail "Advanced local mode expects a Codex env file at $ENV_FILE or via LM_CODEX_ENV_FILE."
  fi

  if [[ -n "${LM_SESSION_LISTENER_BASE_URL:-}" ]]; then
    ok "Listener base URL is set: $LM_SESSION_LISTENER_BASE_URL"
    warn "Listener reachability should be verified at $(trim_quotes "${LM_SESSION_LISTENER_BASE_URL%/}")/api/v1/portals."
  else
    warn "LM_SESSION_LISTENER_BASE_URL is unset; Advanced local mode cannot reach the listener yet."
  fi

  if [[ -n "${LM_PORTAL:-}" ]]; then
    ok "LM_PORTAL is set: $LM_PORTAL"
  else
    warn "LM_PORTAL is unset; portal selection will come from lm_session.defaultPortal or explicit portal arguments."
  fi
else
  if [[ -f "$ENV_FILE" ]]; then
    ok "Listener env file is present for Advanced local mode: $ENV_FILE"
    if grep -q '^LM_SESSION_LISTENER_BASE_URL=' "$ENV_FILE"; then
      ok "Listener base URL is defined in the env file."
      warn "Listener reachability should be verified at $(trim_quotes "$(sed -n 's/^LM_SESSION_LISTENER_BASE_URL=//p' "$ENV_FILE" | head -n 1 | tr -d '\r')")/api/v1/portals."
    else
      warn "LM_SESSION_LISTENER_BASE_URL is not defined in $ENV_FILE."
    fi
  else
    warn "Advanced local env file is missing: $ENV_FILE"
  fi

  if [[ -n "${LM_PORTAL:-}" ]]; then
    ok "LM_PORTAL is set: $LM_PORTAL"
  else
    warn "LM_PORTAL is unset; that is okay and will not block plugin startup."
  fi
fi
