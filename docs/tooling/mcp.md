# MCP policy and setup

OpenCode already supplies file, search, shell, language-server, and Git tooling, so a filesystem MCP would be redundant. This project keeps the MCP surface intentionally small because each server adds tools and context.

Two servers are declared in `opencode.jsonc`, both disabled by default:

| Server | Intended use | Restrictions |
|---|---|---|
| Playwright MCP | inspect and exercise the local UI using synthetic fixtures | isolated, headless, service workers blocked; never open a real case |
| GitHub MCP | inspect public/authorized repositories, issues, and pull requests | read-only, lockdown mode, limited toolsets; no case content in prompts |

Enable only for the session in which it is needed. Keep credentials in environment variables or the operating-system credential mechanism, never in project files. Use `opencode mcp list` to confirm status and `opencode mcp debug <name>` when troubleshooting.

If you install Codegraph or another repository-analysis server later, add it only after verifying its current command, data handling, and token footprint. Do not copy an unverified command from an old lockfile into the active configuration.

