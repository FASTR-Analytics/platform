#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_DIR"

ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY is required}"
BEFORE="${BEFORE_SHA:-}"

# ---------------------------------------------------------------------------
# 1. Detect what changed
# ---------------------------------------------------------------------------

if [ -z "$BEFORE" ] || [ "$BEFORE" = "0000000000000000000000000000000000000000" ]; then
    echo "First push to branch — no before SHA. Skipping."
    exit 0
fi

if ! git cat-file -e "$BEFORE" 2>/dev/null; then
    echo "Before SHA not found (force-push rewrote history?). Skipping."
    exit 0
fi

# Did VERSION change?
VERSION_CHANGED=false
if git diff "$BEFORE"..HEAD -- VERSION | grep -q "^+[^+]"; then
    VERSION_CHANGED=true
fi

# Diff tracked source files only
git diff "$BEFORE"..HEAD -- \
    'server/**/*.ts' 'client/src/**/*.tsx' 'client/src/**/*.ts' 'lib/**/*.ts' \
    ':!deno.lock' ':!lib/translate/ui_strings.ts' \
    > /tmp/changelog_diff.txt 2>/dev/null || true

# Truncate to ~150KB
python3 -c "
data = open('/tmp/changelog_diff.txt','rb').read()
open('/tmp/changelog_diff.txt','wb').write(data[:150000])
"

SOURCE_CHANGED=false
if [ "$(wc -c < /tmp/changelog_diff.txt)" -gt 0 ]; then
    SOURCE_CHANGED=true
fi

if [ "$VERSION_CHANGED" = "false" ] && [ "$SOURCE_CHANGED" = "false" ]; then
    echo "Nothing relevant changed. Skipping."
    exit 0
fi

VERSION="$(cat VERSION)"

# Is this a deploy commit? (deploy script pushes an annotated vX.Y.Z tag)
IS_DEPLOY=false
if git tag --points-at HEAD | grep -qE '^v[0-9]'; then
    IS_DEPLOY=true
fi

echo "Version: $VERSION | VERSION_CHANGED=$VERSION_CHANGED | SOURCE_CHANGED=$SOURCE_CHANGED | IS_DEPLOY=$IS_DEPLOY"

# ---------------------------------------------------------------------------
# 2. Stamp any existing [TBD] entries if this is a deploy
# ---------------------------------------------------------------------------

if [ "$IS_DEPLOY" = "true" ]; then
    python3 << PYEOF
import re, os
version = os.environ.get('VERSION') or open('VERSION').read().strip()
path = 'CHANGELOG_AUTO.txt'
if os.path.exists(path):
    content = open(path).read()
    new_content = re.sub(r'^\[TBD\]', f'[{version}]', content, flags=re.MULTILINE)
    if new_content != content:
        open(path, 'w').write(new_content)
        print(f'Stamped [TBD] entries with [{version}]')
    else:
        print('No [TBD] entries to stamp')
else:
    print('CHANGELOG_AUTO.txt does not exist yet — nothing to stamp')
PYEOF
fi

# ---------------------------------------------------------------------------
# 3. Generate changelog entries for source changes
# ---------------------------------------------------------------------------

if [ "$SOURCE_CHANGED" = "false" ]; then
    echo "No source file changes — skipping AI generation."
else
    if [ "$IS_DEPLOY" = "true" ]; then
        VERSION_TAG="$VERSION"
    else
        VERSION_TAG="TBD"
    fi

    echo "Tagging new entries as [$VERSION_TAG]"

    # --- User-facing entries ---
    python3 << PYEOF
import json, os
diff = open('/tmp/changelog_diff.txt', 'r', errors='replace').read()
prompt = (
    "You are writing release notes for FASTR Analytics, a data analysis platform used by "
    "health data analysts who are not technical.\n\n"
    "Source diff:\n\`\`\`diff\n" + diff + "\n\`\`\`\n\n"
    "Output ONLY lines for changes a non-technical user would directly notice or benefit from "
    "(new features, fixed issues, improved workflows, new export options, visual changes, etc.).\n\n"
    "Format — each line must be exactly:\n"
    "[user] [added] - Description\n"
    "[user] [changed] - Description\n"
    "[user] [fixed] - Description\n\n"
    "Rules:\n"
    "- Write in plain English — no code names, no technical jargon, no component/function names\n"
    "- Describe what the user can now do or what problem is solved, not what code changed\n"
    "- Bad example: 'Fixed NaN propagation in aggregation pipeline' — Good example: 'Fixed incorrect totals appearing in summary tables'\n"
    "- Bad example: 'Added useMemo to DataGrid component' — Good example: 'Improved loading speed on large datasets'\n"
    "- Skip anything backend-only, infra, tooling, logging, or deployment-related\n"
    "- If no user-facing changes, output exactly: SKIP\n"
    "- No preamble, no markdown, no explanation. Maximum 8 lines."
)
body = {
    'model': 'claude-opus-4-6',
    'max_tokens': 1024,
    'messages': [{'role': 'user', 'content': prompt}]
}
json.dump(body, open('/tmp/user_request.json', 'w'))
PYEOF

    curl -sf https://api.anthropic.com/v1/messages \
        -H "x-api-key: $ANTHROPIC_API_KEY" \
        -H "anthropic-version: 2023-06-01" \
        -H "content-type: application/json" \
        -d @/tmp/user_request.json \
        -o /tmp/user_response.json

    python3 -c "
import json
resp = json.load(open('/tmp/user_response.json'))
print(resp['content'][0]['text'].strip())
" > /tmp/user_entries.txt

    echo "--- User entries ---"
    cat /tmp/user_entries.txt

    # --- Admin/technical entries ---
    python3 << PYEOF
import json, os
diff = open('/tmp/changelog_diff.txt', 'r', errors='replace').read()
prompt = (
    "You are writing release notes for FASTR Analytics admins — people who manage instances "
    "but are not necessarily developers.\n\n"
    "Source diff:\n\`\`\`diff\n" + diff + "\n\`\`\`\n\n"
    "Output lines for admin-relevant changes: new capabilities, configuration options, fixed issues, "
    "performance improvements, and anything that affects how the platform behaves or is managed.\n\n"
    "Format — each line must be exactly:\n"
    "[admin] [added] - Description\n"
    "[admin] [changed] - Description\n"
    "[admin] [fixed] - Description\n"
    "[admin] [internal] - Description\n\n"
    "Rules:\n"
    "- Write in plain English — avoid raw code names, function names, and developer jargon\n"
    "- Describe what changed in terms of behaviour or capability, not what code was edited\n"
    "- Bad example: 'Refactored aggregation middleware to use async iterators' — Good example: 'Improved performance when processing large datasets'\n"
    "- Bad example: 'Added index to project_datasets table' — Good example: 'Faster dataset loading for projects with many uploads'\n"
    "- Include everything noteworthy — no maximum line limit\n"
    "- If no meaningful changes, output exactly: SKIP\n"
    "- No preamble, no markdown, no explanation."
)
body = {
    'model': 'claude-opus-4-6',
    'max_tokens': 2048,
    'messages': [{'role': 'user', 'content': prompt}]
}
json.dump(body, open('/tmp/admin_request.json', 'w'))
PYEOF

    curl -sf https://api.anthropic.com/v1/messages \
        -H "x-api-key: $ANTHROPIC_API_KEY" \
        -H "anthropic-version: 2023-06-01" \
        -H "content-type: application/json" \
        -d @/tmp/admin_request.json \
        -o /tmp/admin_response.json

    python3 -c "
import json
resp = json.load(open('/tmp/admin_response.json'))
print(resp['content'][0]['text'].strip())
" > /tmp/admin_entries.txt

    echo "--- Admin entries ---"
    cat /tmp/admin_entries.txt

    # --- Append to CHANGELOG_AUTO.txt ---
    python3 << PYEOF
import os

version_tag = '$VERSION_TAG'

def process(path, audience):
    try:
        raw = open(path).read().strip()
    except FileNotFoundError:
        return []
    if raw == 'SKIP' or not raw:
        return []
    return [
        f'[{version_tag}] {line.strip()}'
        for line in raw.splitlines()
        if line.strip().startswith(f'[{audience}]')
    ]

all_lines = (
    process('/tmp/user_entries.txt', 'user') +
    process('/tmp/admin_entries.txt', 'admin')
)

if not all_lines:
    print('No valid entries to append.')
else:
    changelog_path = 'CHANGELOG_AUTO.txt'
    existing = open(changelog_path).read() if os.path.exists(changelog_path) else ''
    open(changelog_path, 'w').write('\n'.join(all_lines) + '\n' + existing)
    print(f'Wrote {len(all_lines)} line(s) to {changelog_path}:')
    for line in all_lines:
        print(f'  {line}')
PYEOF
fi

# ---------------------------------------------------------------------------
# 4. Commit CHANGELOG_AUTO.txt if changed
# ---------------------------------------------------------------------------

git config user.name  "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git stash --include-untracked
git pull --rebase origin main
git stash pop
git add CHANGELOG_AUTO.txt

if git diff --cached --quiet; then
    echo "No changes to CHANGELOG_AUTO.txt — nothing to commit."
    exit 0
fi

git commit -m "chore: update CHANGELOG_AUTO.txt for v${VERSION} [skip ci]"
git push origin main
