#!/usr/bin/env bash
set -Eeuo pipefail

project_root="$PWD/pbgc-caseworkbench"
starter_zip=""
data_dictionary=""
initialize_speckit=false
install_dependencies=false
force=false

usage() {
  cat <<'EOF'
Usage: scaffold-pbgc-caseworkbench.sh [options]

Options:
  --project-root PATH       Target directory (default: ./pbgc-caseworkbench)
  --starter-zip PATH        Unpack the complete starter ZIP into the target
  --data-dictionary PATH    Copy the supplied XLSM into the reference directory
  --init-speckit            Initialize SpecKit for OpenCode through uvx
  --install-dependencies    Run npm install after scaffolding
  --force                   Permit writes into a nonempty target directory
  -h, --help                Show this help

Example:
  ./scaffold-pbgc-caseworkbench.sh \
    --project-root "$HOME/Dev/pbgc-caseworkbench" \
    --starter-zip ./pbgc-caseworkbench-opencode-starter.zip \
    --init-speckit \
    --install-dependencies
EOF
}

require_value() {
  if [[ $# -lt 2 || -z "$2" ]]; then
    echo "Missing value for $1" >&2
    usage >&2
    exit 2
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-root)
      require_value "$@"
      project_root="$2"
      shift 2
      ;;
    --starter-zip)
      require_value "$@"
      starter_zip="$2"
      shift 2
      ;;
    --data-dictionary)
      require_value "$@"
      data_dictionary="$2"
      shift 2
      ;;
    --init-speckit)
      initialize_speckit=true
      shift
      ;;
    --install-dependencies)
      install_dependencies=true
      shift
      ;;
    --force)
      force=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

absolute_path() {
  local input="$1"
  local parent
  local name

  if [[ "$input" = /* ]]; then
    printf '%s\n' "$input"
    return
  fi

  parent=$(dirname -- "$input")
  name=$(basename -- "$input")
  mkdir -p -- "$parent"
  printf '%s/%s\n' "$(cd -- "$parent" && pwd -P)" "$name"
}

project_root=$(absolute_path "$project_root")

if [[ "$project_root" == "/" ]]; then
  echo "Refusing to use the filesystem root as the project target." >&2
  exit 1
fi

if [[ -d "$project_root" ]]; then
  if [[ -n "$(find "$project_root" -mindepth 1 -maxdepth 1 -print -quit)" && "$force" != true ]]; then
    echo "Target exists and is not empty: $project_root" >&2
    echo "Choose a new path or pass --force." >&2
    exit 1
  fi
elif [[ -e "$project_root" ]]; then
  echo "Target exists and is not a directory: $project_root" >&2
  exit 1
else
  mkdir -p -- "$project_root"
fi

if [[ -n "$starter_zip" ]]; then
  starter_zip=$(absolute_path "$starter_zip")
  if [[ ! -f "$starter_zip" ]]; then
    echo "Starter ZIP not found: $starter_zip" >&2
    exit 1
  fi
  if ! command -v unzip >/dev/null 2>&1; then
    echo "unzip is required to unpack the starter ZIP." >&2
    exit 1
  fi

  temporary_directory=$(mktemp -d "${TMPDIR:-/tmp}/pbgc-caseworkbench.XXXXXXXX")
  cleanup() {
    rm -rf -- "$temporary_directory"
  }
  trap cleanup EXIT

  unzip -q "$starter_zip" -d "$temporary_directory"
  candidate_root="$temporary_directory/pbgc-caseworkbench-opencode-starter"
  if [[ -d "$candidate_root" ]]; then
    content_root="$candidate_root"
  else
    content_root="$temporary_directory"
  fi
  cp -a "$content_root"/. "$project_root"/
fi

directories=(
  ".opencode/agents"
  ".opencode/skills/pbgc-evidence-intake"
  ".opencode/skills/pbgc-data-dictionary"
  ".opencode/skills/pbgc-plan-rule-modeling"
  ".opencode/skills/pbgc-actuarial-calculation"
  ".opencode/skills/pbgc-r5-plan-summary"
  ".opencode/skills/pbgc-workbook-generation"
  ".opencode/skills/pbgc-pii-boundary"
  ".opencode/skills/pbgc-regression-validation"
  ".opencode/skills/pbgc-module-salvage"
  ".opencode/skills/pbgc-ui-design"
  "docs/adr"
  "docs/tooling"
  "governance"
  "references/data-dictionary"
  "references/source-inventory"
  "references/templates"
  "schemas/case"
  "schemas/evidence"
  "schemas/plan-rules"
  "schemas/calculations"
  "schemas/work-products"
  "schemas/audit"
  "src/app"
  "src/adapters/documents"
  "src/adapters/storage"
  "src/adapters/workbooks"
  "src/domain/audit"
  "src/domain/calculations"
  "src/domain/evidence"
  "src/domain/field-catalog"
  "src/domain/plan-rules"
  "src/domain/population"
  "src/domain/state-model"
  "src/domain/work-products"
  "src/features/case-home"
  "src/features/intake"
  "src/features/evidence-review"
  "src/features/plan-summary"
  "src/features/population"
  "src/features/calculations"
  "src/features/work-products"
  "src/features/quality-review"
  "src/ui"
  "src/workers"
  "tests/unit"
  "tests/integration"
  "tests/regression"
  "tests/fixtures/synthetic"
  "scripts"
  "public/vendor"
  "public/models"
)

for relative in "${directories[@]}"; do
  mkdir -p -- "$project_root/$relative"
done

placeholder_files=(
  "README.md"
  "AGENTS.md"
  "opencode.jsonc"
  "docs/architecture.md"
  "docs/design.md"
  "governance/constitution.md"
  "references/source-inventory/module-salvage-ledger.md"
)

for relative in "${placeholder_files[@]}"; do
  target="$project_root/$relative"
  if [[ ! -e "$target" ]]; then
    printf '%s\n' '# TODO: replace from the PBGC Case Workbench starter package' > "$target"
  fi
done

if [[ -n "$data_dictionary" ]]; then
  data_dictionary=$(absolute_path "$data_dictionary")
  if [[ ! -f "$data_dictionary" ]]; then
    echo "Data dictionary not found: $data_dictionary" >&2
    exit 1
  fi
  cp -f -- "$data_dictionary" "$project_root/references/data-dictionary/data_dictionary_complete.xlsm"
fi

if [[ "$initialize_speckit" == true ]]; then
  if ! command -v uvx >/dev/null 2>&1; then
    echo "uvx is required for SpecKit. Install uv, then rerun with --init-speckit." >&2
    exit 1
  fi

  (
    cd "$project_root"
    if [[ ! -d .specify ]]; then
      uvx --from git+https://github.com/github/spec-kit.git \
        specify init --here --force --non-interactive --integration opencode --script sh
    else
      echo "SpecKit is already initialized; leaving .specify unchanged."
    fi

    if [[ -f governance/constitution.md ]]; then
      mkdir -p .specify/memory
      cp -f governance/constitution.md .specify/memory/constitution.md
    fi
  )
fi

if [[ "$install_dependencies" == true ]]; then
  if [[ ! -f "$project_root/package.json" ]]; then
    echo "package.json is missing. Use --starter-zip before installing dependencies." >&2
    exit 1
  fi
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm is required to install project dependencies." >&2
    exit 1
  fi
  (
    cd "$project_root"
    npm install
  )
fi

echo "PBGC Case Workbench tree is ready at $project_root"
if [[ -z "$starter_zip" ]]; then
  echo "Next: copy/extract the starter package into this tree, then open it in OpenCode."
else
  echo "The complete starter package was extracted. Open the directory in OpenCode."
fi

