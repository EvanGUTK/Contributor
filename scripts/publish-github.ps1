# Optional PowerShell wrapper. Preferred: open WSL, cd into Contributor, then bash scripts/publish-github.sh.
$ErrorActionPreference = 'Stop'
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'Install and authenticate GitHub CLI in PowerShell or use the WSL Bash script.' }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Install Git or use the WSL Bash script.' }
$Owner = 'EvanGUTK'; $Name = 'contributor'
$Login = gh api user --jq .login
if ($LASTEXITCODE -ne 0 -or $Login.Trim() -ne $Owner) { throw 'GitHub CLI is not authenticated as EvanGUTK.' }
gh repo view "$Owner/$Name" *> $null
if ($LASTEXITCODE -eq 0) { throw 'Repository exists. Refusing to overwrite.' }
if ((git remote).Length -gt 0) { throw 'Working directory already has git remotes.' }
$decision = Read-Host 'This uploads the current folder as PUBLIC. Type PUBLIC to proceed'
if ($decision -cne 'PUBLIC') { Write-Host 'Canceled.'; exit 0 }
if (-not (Test-Path '.git')) { git init -b main }
git add --all
git diff --cached --name-only
$answer = Read-Host 'Type PUSH to publish staged files'
if ($answer -cne 'PUSH') { Write-Host 'Canceled.'; exit 0 }
git commit -m 'feat: introduce Contributor open-source discovery MVP'
gh repo create "$Owner/$Name" --public --source=. --remote=origin --push --description 'Free BYOK-first GitHub discovery and memory-aware MCP'
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI could not publish the repository' }
$visibility = gh repo view "$Owner/$Name" --json visibility --jq .visibility
if ($visibility -ne 'PUBLIC') { throw "Unexpected visibility: $visibility" }
Write-Host "Published: https://github.com/$Owner/$Name"
