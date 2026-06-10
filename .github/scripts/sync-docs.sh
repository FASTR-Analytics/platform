#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_DIR"

ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY is required}"
SENDGRID_API_KEY="${SENDGRID_API_KEY:-}"
SENDGRID_FROM_EMAIL="${SENDGRID_FROM_EMAIL:-}"
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

git diff "$BEFORE"..HEAD -- \
    'server/**/*.ts' 'client/src/**/*.tsx' 'client/src/**/*.ts' 'lib/**/*.ts' \
    ':!deno.lock' ':!lib/translate/ui_strings.ts' \
    > /tmp/sync_docs_diff.txt 2>/dev/null || true

python3 -c "
data = open('/tmp/sync_docs_diff.txt','rb').read()
open('/tmp/sync_docs_diff.txt','wb').write(data[:100000])
"

if [ "$(wc -c < /tmp/sync_docs_diff.txt)" -eq 0 ]; then
    echo "No source file changes. Skipping."
    exit 0
fi

echo "Diff: $(wc -c < /tmp/sync_docs_diff.txt) bytes"

# ---------------------------------------------------------------------------
# 2. Read doc pages from site repo
# ---------------------------------------------------------------------------

python3 << 'PYEOF'
import json, glob, os

doc_dir = '_site_repo/src/content/docs'
pages = {}

for section in ['admin-guide', 'user-guide', 'fr/admin-guide', 'fr/user-guide']:
    for filepath in sorted(glob.glob(os.path.join(doc_dir, section, '*.md'))):
        rel_path = os.path.relpath(filepath, doc_dir)
        pages[rel_path] = open(filepath, 'r', encoding='utf-8').read()

json.dump(pages, open('/tmp/doc_pages.json', 'w'), ensure_ascii=False)
print(f"Loaded {len(pages)} doc pages: {sorted(pages.keys())}")
PYEOF

# ---------------------------------------------------------------------------
# 3. Build and send Claude API request
# ---------------------------------------------------------------------------

python3 << 'PYEOF'
import json

diff = open('/tmp/sync_docs_diff.txt', 'r', errors='replace').read()
pages = json.load(open('/tmp/doc_pages.json'))

prompt = (
    "You are reviewing platform source code changes to determine whether the FASTR Analytics "
    "documentation site needs updating.\n\n"
    "Platform diff:\n```diff\n" + diff + "\n```\n\n"
    "Current documentation pages (JSON — keys are paths relative to src/content/docs/, "
    "values are full markdown content):\n"
    + json.dumps(pages, ensure_ascii=False) + "\n\n"
    "Documentation conventions:\n"
    "- Audiences: Administrators (admin-guide) and Analysts/Editors/Viewers (user-guide)\n"
    "- Prose-first: every section opens with explanatory prose; bullet lists only enumerate specific items\n"
    "- Terminology (use exactly): Instance | Project | Admin area | Facility | Module | "
    "Slide deck | Visualization | Data window\n"
    "- Voice: direct, present tense, second person (\"Click Save\", not \"You will click\")\n"
    "- Bold UI element names: **Save**, **Create**, **Delete**\n"
    "- Screenshot placeholders look like: :::caution[Screenshot needed]\\nDescription\\n:::\n"
    "- Actual screenshots look like: ![Alt text](/images/filename.png)\n"
    "- Do NOT modify methodology/, overview/, or resources/ pages\n"
    "- English pages are the source; fr/ pages mirror them in French\n"
    "- Keep sentences simple to aid translation\n"
    "- Preserve existing frontmatter (title, description, sidebar.order) unless the title must change\n"
    "- Do not add, remove, or modify screenshot placeholders or image references — leave them exactly as-is\n\n"
    "Task:\n"
    "1. Determine which admin-guide and user-guide pages need updating based on the platform changes\n"
    "2. Only update pages where the platform changes affect documented behaviour — skip if no user-visible change\n"
    "3. For each page that needs updating, return the complete updated markdown content\n"
    "4. Update both the English page AND its fr/ mirror (translate the changed text to French)\n\n"
    "Return strict JSON only — no preamble, no markdown wrapper:\n"
    "{\n"
    "  \"updates_needed\": true,\n"
    "  \"pages\": [\n"
    "    {\n"
    "      \"path\": \"admin-guide/modules.md\",\n"
    "      \"updated_content\": \"---\\ntitle: ...\\n---\\n...\",\n"
    "      \"reason\": \"one sentence explaining what changed\"\n"
    "    }\n"
    "  ]\n"
    "}\n\n"
    "If no updates needed: {\"updates_needed\": false, \"pages\": []}"
)

body = {
    'model': 'claude-sonnet-4-6',
    'max_tokens': 16000,
    'system': 'You output only valid JSON. No preamble, no explanation, no markdown code fences.',
    'messages': [{'role': 'user', 'content': prompt}]
}
json.dump(body, open('/tmp/sync_docs_request.json', 'w'))
print(f"Request: {len(json.dumps(body))} bytes")
PYEOF

curl -sf https://api.anthropic.com/v1/messages \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d @/tmp/sync_docs_request.json \
    -o /tmp/sync_docs_response.json

python3 << 'PYEOF'
import json

resp = json.load(open('/tmp/sync_docs_response.json'))
text = resp['content'][0]['text'].strip()

# Use raw_decode to extract the first complete JSON object, ignoring any
# surrounding prose or markdown fences the model may have included.
start = text.find('{')
if start == -1:
    print(f"No JSON object found in response. Raw text:\n{text[:500]}")
    result = {'updates_needed': False, 'pages': []}
else:
    try:
        result, _ = json.JSONDecoder().raw_decode(text, start)
    except json.JSONDecodeError as e:
        print(f"JSON parse error: {e}\nRaw text:\n{text[:500]}")
        result = {'updates_needed': False, 'pages': []}

json.dump(result, open('/tmp/sync_docs_result.json', 'w'))
print(f"updates_needed={result.get('updates_needed')}, pages={[p['path'] for p in result.get('pages', [])]}")
PYEOF

# ---------------------------------------------------------------------------
# 4. Apply updates, detect screenshot pages
# ---------------------------------------------------------------------------

python3 << 'PYEOF'
import json, os, re, glob

result = json.load(open('/tmp/sync_docs_result.json'))

if not result.get('updates_needed') or not result.get('pages'):
    print("No documentation updates needed.")
    json.dump([], open('/tmp/screenshot_pages.json', 'w'))
    raise SystemExit(0)

doc_dir = '_site_repo/src/content/docs'
screenshot_pages = []

for page in result['pages']:
    path = page['path']
    updated_content = page['updated_content']
    reason = page.get('reason', '')
    full_path = os.path.join(doc_dir, path)

    original_content = ''
    if os.path.exists(full_path):
        original_content = open(full_path, 'r', encoding='utf-8').read()

    has_existing_images = bool(re.search(r'!\[', original_content))
    has_placeholders = bool(re.search(r':::caution\[(?:Screenshot|Video) needed\]', original_content))

    if has_existing_images or has_placeholders:
        screenshot_pages.append({
            'path': path,
            'reason': reason,
            'has_existing_images': has_existing_images,
            'has_placeholders': has_placeholders,
        })

    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    open(full_path, 'w', encoding='utf-8').write(updated_content)
    print(f"Updated: {path}")

json.dump(screenshot_pages, open('/tmp/screenshot_pages.json', 'w'))
if screenshot_pages:
    print(f"Pages with screenshots/placeholders: {[p['path'] for p in screenshot_pages]}")
PYEOF

# ---------------------------------------------------------------------------
# 5. Commit and push to site repo
# ---------------------------------------------------------------------------

(
    cd _site_repo
    git config user.name  "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    git add src/content/docs/

    if git diff --cached --quiet; then
        echo "No changes to documentation — nothing to commit."
    else
        git commit -m "docs: sync documentation with platform changes"
        git push origin main
        echo "Site repo updated."
    fi
)

# ---------------------------------------------------------------------------
# 6. Email notification for pages with screenshots
# ---------------------------------------------------------------------------

python3 << 'PYEOF'
import json, os, sys

screenshot_pages = json.load(open('/tmp/screenshot_pages.json'))
if not screenshot_pages:
    print("No screenshot pages — skipping email.")
    raise SystemExit(0)

sendgrid_api_key = os.environ.get('SENDGRID_API_KEY', '')
sendgrid_from = os.environ.get('SENDGRID_FROM_EMAIL', '')

if not sendgrid_api_key or not sendgrid_from:
    print("Warning: SENDGRID_API_KEY or SENDGRID_FROM_EMAIL not set — skipping email.")
    raise SystemExit(0)

lines = [
    "The FASTR documentation site has been automatically updated to reflect recent platform changes.",
    "The following pages contain screenshots or screenshot placeholders that may need attention:\n",
]
for p in screenshot_pages:
    tags = []
    if p['has_existing_images']:
        tags.append("existing screenshots may be out of date")
    if p['has_placeholders']:
        tags.append("screenshot/video placeholders present")
    lines.append(f"  {p['path']}")
    lines.append(f"    What changed: {p['reason']}")
    lines.append(f"    Note: {' | '.join(tags)}")
    lines.append("")

lines += [
    "Please retake the relevant screenshots and commit them to:",
    "https://github.com/FASTR-Analytics/site",
    "",
    "This notification was sent automatically by the platform sync-docs workflow.",
]

payload = {
    "personalizations": [{"to": [{"email": "nick@usefuldata.com.au"}]}],
    "from": {"email": sendgrid_from},
    "subject": "FASTR docs updated — screenshots need retaking",
    "content": [{"type": "text/plain", "value": "\n".join(lines)}],
}
json.dump(payload, open('/tmp/email_payload.json', 'w'))
print("Email payload ready.")
print("\n".join(lines))
PYEOF

SCREENSHOT_COUNT=$(python3 -c "import json; print(len(json.load(open('/tmp/screenshot_pages.json'))))")
if [ "$SCREENSHOT_COUNT" -gt 0 ] && [ -n "$SENDGRID_API_KEY" ] && [ -n "$SENDGRID_FROM_EMAIL" ]; then
    curl -sf https://api.sendgrid.com/v3/mail/send \
        -H "Authorization: Bearer $SENDGRID_API_KEY" \
        -H "Content-Type: application/json" \
        -d @/tmp/email_payload.json \
        && echo "Screenshot notification email sent to nick@usefuldata.com.au." \
        || echo "Warning: email send failed — check SENDGRID_API_KEY and verified sender address."
fi
