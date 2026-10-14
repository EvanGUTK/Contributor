#!/usr/bin/env bash
# Explicitly publish the bundled repository as a NEW public GitHub repository.
set -euo pipefail
OWNER="${CONTRIBUTOR_GITHUB_OWNER:-EvanGUTK}"
NAME="${CONTRIBUTOR_GITHUB_REPO:-contributor}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"
for tool in gh git; do command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 1; }; done
gh auth status >/dev/null || { echo "Sign in with 'gh auth login' first" >&2; exit 1; }
LOGIN="$(gh api user --jq .login)"
if [[ "$LOGIN" != "$OWNER" ]]; then echo "Authenticated account '$LOGIN' != expected '$OWNER'; refusing." >&2; exit 1; fi
if gh repo view "$OWNER/$NAME" >/dev/null 2>&1; then echo "Repository $OWNER/$NAME already exists. Refusing to overwrite." >&2; exit 1; fi
if [[ -d .git ]] && [[ -n "$(git remote)" ]]; then echo "This working directory already has remotes; refusing to change them." >&2; exit 1; fi
if [[ ! -f LICENSE || ! -f README.md ]]; then echo "Missing source license or README" >&2; exit 1; fi
cat <<BANNER
Publishing as PUBLIC: https://github.com/$OWNER/$NAME
This operation uploads the entire source tree EXCEPT ignored files.
Verify there are NO credentials, private files or copyrighted third-party code in it.
BANNER
read -r -p "Type PUBLIC to continue: " decision
[[ "$decision" == PUBLIC ]] || { echo 'Canceled without publishing'; exit 1; }
if [[ ! -d .git ]]; then git init -b main; fi
git add --all
echo 'Staged path list:'
git diff --cached --name-only
read -r -p "Type PUSH to create the public repository and push those paths: " confirm
[[ "$confirm" == PUSH ]] || { echo 'Canceled before remote creation'; exit 1; }
if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  git commit -m 'feat: introduce Contributor open-source discovery MVP'
elif [[ -n "$(git diff --cached --name-only)" ]]; then
  git commit -m 'chore: prepare Contributor public source'
fi
gh repo create "$OWNER/$NAME" --public --source=. --remote=origin --push \
  --description 'Free BYOK-first GitHub opportunity discovery and memory-aware MCP for open-source contributors'
visibility="$(gh repo view "$OWNER/$NAME" --json visibility --jq .visibility)"
[[ "$visibility" == PUBLIC ]] || { echo "Unexpected visibility: $visibility" >&2; exit 1; }
echo "Published: https://github.com/$OWNER/$NAME"
