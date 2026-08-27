[CmdletBinding()]
param(
    [string]$ProjectRoot = (Join-Path (Get-Location) "pbgc-caseworkbench"),
    [string]$StarterZipPath,
    [string]$DataDictionaryPath,
    [switch]$InitializeSpecKit,
    [switch]$InstallDependencies,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$ProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot)

if (Test-Path $ProjectRoot) {
    $hasContent = @(Get-ChildItem -LiteralPath $ProjectRoot -Force -ErrorAction SilentlyContinue).Count -gt 0
    if ($hasContent -and -not $Force) {
        throw "Target exists and is not empty: $ProjectRoot. Choose a new path or pass -Force."
    }
} else {
    New-Item -ItemType Directory -Path $ProjectRoot | Out-Null
}

if ($StarterZipPath) {
    $starterArchive = [System.IO.Path]::GetFullPath($StarterZipPath)
    if (-not (Test-Path -LiteralPath $starterArchive -PathType Leaf)) {
        throw "Starter ZIP not found: $starterArchive"
    }

    $temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("pbgc-caseworkbench-" + [System.Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
    try {
        Expand-Archive -LiteralPath $starterArchive -DestinationPath $temporaryDirectory -Force
        $candidateRoot = Join-Path $temporaryDirectory "pbgc-caseworkbench-opencode-starter"
        $contentRoot = if (Test-Path -LiteralPath $candidateRoot -PathType Container) { $candidateRoot } else { $temporaryDirectory }
        Get-ChildItem -LiteralPath $contentRoot -Force | Copy-Item -Destination $ProjectRoot -Recurse -Force
    } finally {
        Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$directories = @(
    ".opencode/agents",
    ".opencode/skills/pbgc-evidence-intake",
    ".opencode/skills/pbgc-data-dictionary",
    ".opencode/skills/pbgc-plan-rule-modeling",
    ".opencode/skills/pbgc-actuarial-calculation",
    ".opencode/skills/pbgc-r5-plan-summary",
    ".opencode/skills/pbgc-workbook-generation",
    ".opencode/skills/pbgc-pii-boundary",
    ".opencode/skills/pbgc-regression-validation",
    ".opencode/skills/pbgc-module-salvage",
    ".opencode/skills/pbgc-ui-design",
    "docs/adr",
    "docs/tooling",
    "governance",
    "references/data-dictionary",
    "references/source-inventory",
    "references/templates",
    "schemas/case",
    "schemas/evidence",
    "schemas/plan-rules",
    "schemas/calculations",
    "schemas/work-products",
    "schemas/audit",
    "src/app",
    "src/adapters/documents",
    "src/adapters/storage",
    "src/adapters/workbooks",
    "src/domain/audit",
    "src/domain/calculations",
    "src/domain/evidence",
    "src/domain/field-catalog",
    "src/domain/plan-rules",
    "src/domain/population",
    "src/domain/state-model",
    "src/domain/work-products",
    "src/features/case-home",
    "src/features/intake",
    "src/features/evidence-review",
    "src/features/plan-summary",
    "src/features/population",
    "src/features/calculations",
    "src/features/work-products",
    "src/features/quality-review",
    "src/ui",
    "src/workers",
    "tests/unit",
    "tests/integration",
    "tests/regression",
    "tests/fixtures/synthetic",
    "scripts",
    "public/vendor",
    "public/models"
)

foreach ($relative in $directories) {
    New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot $relative) | Out-Null
}

$placeholderFiles = @(
    "README.md",
    "AGENTS.md",
    "opencode.jsonc",
    "docs/architecture.md",
    "docs/design.md",
    "governance/constitution.md",
    "references/source-inventory/module-salvage-ledger.md"
)

foreach ($relative in $placeholderFiles) {
    $target = Join-Path $ProjectRoot $relative
    if (-not (Test-Path $target)) {
        "# TODO: replace from the PBGC Case Workbench starter package" | Set-Content -LiteralPath $target -Encoding utf8
    }
}

if ($DataDictionaryPath) {
    $source = [System.IO.Path]::GetFullPath($DataDictionaryPath)
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Data dictionary not found: $source"
    }
    Copy-Item -LiteralPath $source -Destination (Join-Path $ProjectRoot "references/data-dictionary/data_dictionary_complete.xlsm") -Force
}

if ($InitializeSpecKit) {
    $uvx = Get-Command uvx -ErrorAction SilentlyContinue
    if (-not $uvx) {
        throw "uvx is required for SpecKit. Install uv, then rerun with -InitializeSpecKit."
    }
    Push-Location $ProjectRoot
    try {
        & uvx --from git+https://github.com/github/spec-kit.git specify init --here --force --non-interactive --integration opencode --script ps
        if ($LASTEXITCODE -ne 0) { throw "SpecKit initialization failed with exit code $LASTEXITCODE." }
        $constitutionSource = Join-Path $ProjectRoot "governance/constitution.md"
        $constitutionTarget = Join-Path $ProjectRoot ".specify/memory/constitution.md"
        if (Test-Path $constitutionSource) {
            New-Item -ItemType Directory -Force -Path (Split-Path $constitutionTarget) | Out-Null
            Copy-Item -LiteralPath $constitutionSource -Destination $constitutionTarget -Force
        }
    } finally {
        Pop-Location
    }
}

if ($InstallDependencies) {
    $packageJson = Join-Path $ProjectRoot "package.json"
    if (-not (Test-Path $packageJson)) {
        throw "package.json is missing. Extract/copy the starter package before installing dependencies."
    }
    Push-Location $ProjectRoot
    try {
        & npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE." }
    } finally {
        Pop-Location
    }
}

Write-Host "PBGC Case Workbench tree is ready at $ProjectRoot"
if (-not $StarterZipPath) {
    Write-Host "Next: replace placeholder files with the starter package, then open the directory in OpenCode."
} else {
    Write-Host "The complete starter package was extracted. Open the directory in OpenCode."
}
