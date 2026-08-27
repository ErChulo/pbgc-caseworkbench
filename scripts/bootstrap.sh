#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL=false
SPECKIT=false

for arg in "$@"; do
  case "$arg" in
    --install) INSTALL=true ;;
    --speckit) SPECKIT=true ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

cd "$PROJECT_ROOT"

if [ "$INSTALL" = true ]; then
  npm install
fi

if [ "$SPECKIT" = true ]; then
  if ! command -v uvx >/dev/null 2>&1; then
    echo "uvx is required. Install uv, then rerun with --speckit." >&2
    exit 1
  fi
  if [ ! -d .specify ]; then
    uvx --from git+https://github.com/github/spec-kit.git specify init --here --force --non-interactive --integration opencode --script sh
  else
    echo "SpecKit is already initialized; leaving .specify unchanged."
  fi
  mkdir -p .specify/memory
  cp governance/constitution.md .specify/memory/constitution.md
fi

echo "Bootstrap complete. Run: npm run dev"

