[CmdletBinding()]
param(
    [switch]$InstallDependencies,
    [switch]$InitializeSpecKit
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
Push-Location $ProjectRoot

try {
    if ($InstallDependencies) {
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE." }
    }

    if ($InitializeSpecKit) {
        if (-not (Get-Command uvx -ErrorAction SilentlyContinue)) {
            throw "uvx is required. Install uv, then rerun with -InitializeSpecKit."
        }

        if (-not (Test-Path ".specify")) {
            uvx --from git+https://github.com/github/spec-kit.git specify init --here --force --non-interactive --integration opencode --script ps
            if ($LASTEXITCODE -ne 0) { throw "SpecKit initialization failed with exit code $LASTEXITCODE." }
        } else {
            Write-Host "SpecKit is already initialized; leaving .specify unchanged."
        }

        New-Item -ItemType Directory -Force -Path ".specify/memory" | Out-Null
        Copy-Item -LiteralPath "governance/constitution.md" -Destination ".specify/memory/constitution.md" -Force
    }

    Write-Host "Bootstrap complete. Run: npm run dev"
} finally {
    Pop-Location
}

