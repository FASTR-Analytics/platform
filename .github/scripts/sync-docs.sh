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

# Manual runs (workflow_dispatch) can override the diff base and skip the
# deploy-commit gate — used to recover a release the automatic run missed.
DIFF_BASE_OVERRIDE="${DIFF_BASE_OVERRIDE:-}"
if [ -n "$DIFF_BASE_OVERRIDE" ]; then
    if ! git cat-file -e "$DIFF_BASE_OVERRIDE" 2>/dev/null; then
        echo "DIFF_BASE_OVERRIDE '$DIFF_BASE_OVERRIDE' not found in history."
        exit 1
    fi
    DIFF_BASE="$DIFF_BASE_OVERRIDE"
    echo "Manual run — diffing against override: $DIFF_BASE"
else

# Only run for deploy commits (same convention as generate-changelog.sh)
COMMIT_MSG="$(git log -1 --format=%s)"
if [[ "$COMMIT_MSG" != "Deploy version"* ]]; then
    echo "Not a deploy commit. Skipping."
    exit 0
fi

# Diff against the previous deploy commit so the whole release is covered,
# not just the final push. Falls back to BEFORE_SHA for the first deploy.
PREV_DEPLOY="$(git log --grep '^Deploy version' --format=%H --skip 1 -n 1)"
if [ -n "$PREV_DEPLOY" ]; then
    DIFF_BASE="$PREV_DEPLOY"
    echo "Diffing against previous deploy: $PREV_DEPLOY"
elif [ -n "$BEFORE" ] && [ "$BEFORE" != "0000000000000000000000000000000000000000" ] && git cat-file -e "$BEFORE" 2>/dev/null; then
    DIFF_BASE="$BEFORE"
    echo "No previous deploy found — diffing against push base: $BEFORE"
else
    echo "No previous deploy and no usable before SHA. Skipping."
    exit 0
fi

fi  # end DIFF_BASE_OVERRIDE

git diff "$DIFF_BASE"..HEAD -- \
    'server/**/*.ts' 'client/src/**/*.tsx' 'client/src/**/*.ts' 'lib/**/*.ts' \
    ':!deno.lock' ':!lib/translate/ui_strings.ts' \
    > /tmp/sync_docs_diff.txt 2>/dev/null || true

python3 -c "
data = open('/tmp/sync_docs_diff.txt','rb').read()
open('/tmp/sync_docs_diff.txt','wb').write(data[:200000])
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
    "1. Determine which admin-guide and user-guide pages need TEXT updates based on the platform changes.\n"
    "   Only include a page here if its prose wording genuinely needs to change.\n"
    "2. For each page needing text updates, return the complete updated markdown content.\n"
    "3. Update both the English page AND its fr/ mirror (translate the changed text to French).\n"
    "4. Separately, identify every specific screenshot or placeholder that needs retaking because the\n"
    "   UI area it depicts has visually changed. This includes:\n"
    "   - Screenshots on pages whose text you also updated (list only the specific images affected, not all of them)\n"
    "   - Screenshots on pages whose text does NOT need updating but whose UI has visually changed\n"
    "   For each affected screenshot, provide its image path exactly as it appears in the markdown\n"
    "   (e.g. /images/users-en.png), or null if it is a :::caution[Screenshot needed]::: placeholder\n"
    "   (in which case describe the placeholder content instead).\n"
    "   Only flag screenshots for visual UI changes — not backend or logic-only changes.\n\n"
    "Return strict JSON only — no preamble, no markdown wrapper:\n"
    "{\n"
    "  \"updates_needed\": true,\n"
    "  \"pages\": [\n"
    "    {\n"
    "      \"path\": \"admin-guide/modules.md\",\n"
    "      \"updated_content\": \"---\\ntitle: ...\\n---\\n...\",\n"
    "      \"reason\": \"one sentence explaining what text changed\"\n"
    "    }\n"
    "  ],\n"
    "  \"screenshot_updates\": [\n"
    "    {\n"
    "      \"path\": \"admin-guide/users.md\",\n"
    "      \"screenshots\": [\n"
    "        {\n"
    "          \"image_path\": \"/images/user-permissions-project-en.png\",\n"
    "          \"placeholder_description\": null,\n"
    "          \"reason\": \"Permissions dialog now shows a bulk-assign toggle\"\n"
    "        },\n"
    "        {\n"
    "          \"image_path\": null,\n"
    "          \"placeholder_description\": \"Add user dialog\",\n"
    "          \"reason\": \"Add user dialog has a new required role field\"\n"
    "        }\n"
    "      ]\n"
    "    }\n"
    "  ]\n"
    "}\n\n"
    "If no text updates needed: \"pages\": []\n"
    "If no screenshot updates needed: \"screenshot_updates\": []"
)

body = {
    'model': 'claude-sonnet-4-6',
    'max_tokens': 64000,
    'stream': True,
    'system': 'You output only valid JSON. No preamble, no explanation, no markdown code fences.',
    'messages': [{'role': 'user', 'content': prompt}]
}
json.dump(body, open('/tmp/sync_docs_request.json', 'w'))
print(f"Request: {len(json.dumps(body))} bytes")
PYEOF

python3 << 'PYEOF'
import json, os, sys, urllib.request, urllib.error

# Streaming is required for large max_tokens — long non-streaming requests
# are rejected or time out at the network layer.
req = urllib.request.Request(
    'https://api.anthropic.com/v1/messages',
    data=open('/tmp/sync_docs_request.json', 'rb').read(),
    headers={
        'x-api-key': os.environ['ANTHROPIC_API_KEY'],
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
    },
)

text_parts = []
stop_reason = None
try:
    with urllib.request.urlopen(req, timeout=1800) as resp:
        for raw_line in resp:
            line = raw_line.decode('utf-8').strip()
            if not line.startswith('data: '):
                continue
            event = json.loads(line[len('data: '):])
            if event.get('type') == 'content_block_delta':
                delta = event.get('delta', {})
                if delta.get('type') == 'text_delta':
                    text_parts.append(delta['text'])
            elif event.get('type') == 'message_delta':
                stop_reason = event.get('delta', {}).get('stop_reason')
            elif event.get('type') == 'error':
                print(f"API stream error: {event}")
                sys.exit(1)
except urllib.error.HTTPError as e:
    print(f"API request failed: {e.code} {e.read().decode('utf-8', errors='replace')[:1000]}")
    sys.exit(1)

text = ''.join(text_parts).strip()
print(f"Response: {len(text)} chars, stop_reason={stop_reason}")

if stop_reason == 'max_tokens':
    print("ERROR: response was truncated at max_tokens — doc updates would be lost. Failing loudly.")
    sys.exit(1)

# Use raw_decode to extract the first complete JSON object, ignoring any
# surrounding prose or markdown fences the model may have included.
start = text.find('{')
if start == -1:
    print(f"ERROR: no JSON object found in response. Raw text:\n{text[:500]}")
    sys.exit(1)
try:
    result, _ = json.JSONDecoder().raw_decode(text, start)
except json.JSONDecodeError as e:
    print(f"ERROR: JSON parse error: {e}\nRaw text:\n{text[:500]}")
    sys.exit(1)

json.dump(result, open('/tmp/sync_docs_result.json', 'w'))
print(f"updates_needed={result.get('updates_needed')}, pages={[p['path'] for p in result.get('pages', [])]}")
PYEOF

# ---------------------------------------------------------------------------
# 4. Apply updates, detect screenshot pages
# ---------------------------------------------------------------------------

python3 << 'PYEOF'
import json, os

result = json.load(open('/tmp/sync_docs_result.json'))
doc_dir = '_site_repo/src/content/docs'

# Apply text updates
for page in result.get('pages', []):
    full_path = os.path.join(doc_dir, page['path'])
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    open(full_path, 'w', encoding='utf-8').write(page['updated_content'])
    print(f"Updated text: {page['path']}")

# Build screenshot notification list from the AI's explicit screenshot_updates
screenshot_pages = result.get('screenshot_updates', [])
json.dump(screenshot_pages, open('/tmp/screenshot_pages.json', 'w'))

if not result.get('pages') and not screenshot_pages:
    print("No documentation or screenshot updates needed.")

if screenshot_pages:
    print(f"Screenshot updates flagged: {[p['path'] for p in screenshot_pages]}")
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
import json, os, sys, re, base64, mimetypes

screenshot_pages = json.load(open('/tmp/screenshot_pages.json'))
if not screenshot_pages:
    print("No screenshot pages — skipping email.")
    raise SystemExit(0)

sendgrid_api_key = os.environ.get('SENDGRID_API_KEY', '')
sendgrid_from = os.environ.get('SENDGRID_FROM_EMAIL', '')

if not sendgrid_api_key or not sendgrid_from:
    print("Warning: SENDGRID_API_KEY or SENDGRID_FROM_EMAIL not set — skipping email.")
    raise SystemExit(0)

def find_section_heading(doc_dir, page_path, search_text):
    """Return the heading of the section immediately above the line containing search_text."""
    full_path = os.path.join(doc_dir, page_path)
    if not os.path.exists(full_path):
        return None
    lines = open(full_path, 'r', encoding='utf-8').read().split('\n')
    target_idx = next(
        (i for i, line in enumerate(lines) if search_text.lower() in line.lower()),
        None
    )
    if target_idx is None:
        return None
    for i in range(target_idx - 1, -1, -1):
        stripped = lines[i].strip()
        if stripped.startswith('#'):
            return stripped.lstrip('#').strip()
    return None

def resolve_disk_path(raw_path):
    """
    Normalise whatever Claude returned for image_path and find the file on disk.
    Claude may return the bare URL (/images/foo.png), a path with /public/ prefix,
    or accidentally include markdown syntax (![alt](/images/foo.png)).
    Returns (normalised_url, disk_path) or (normalised_url, None) if not found.
    """
    if not raw_path:
        return None, None
    # Strip markdown image syntax: ![alt](/path) → /path
    m = re.search(r'!\[.*?\]\(([^)]+)\)', raw_path)
    if m:
        raw_path = m.group(1).strip()
    raw_path = raw_path.strip()
    if not raw_path.startswith('/'):
        raw_path = '/' + raw_path
    # Try the two likely disk locations
    candidates = [
        f"_site_repo/public{raw_path}",   # /images/foo.png  → public/images/foo.png
        f"_site_repo{raw_path}",           # /public/images/foo.png → public/images/foo.png
    ]
    for c in candidates:
        if os.path.exists(c):
            print(f"  Found image: {raw_path} → {c}")
            return raw_path, c
    print(f"  Image not found on disk: {raw_path} (tried: {candidates})")
    return raw_path, None

text_lines = [
    "The FASTR documentation site has been automatically updated to reflect recent platform changes.",
    "The following screenshots need retaking:\n",
]
html_sections = []
attachments = []
cid_counter = 0

for p in screenshot_pages:
    file_path = f"src/content/docs/{p['path']}"
    html_imgs = ""
    text_screenshots = []

    for s in p.get('screenshots', []):
        raw_img_path = s.get('image_path')
        reason = s.get('reason', '')
        placeholder_desc = s.get('placeholder_description')

        print(f"  Screenshot entry — image_path={raw_img_path!r}, placeholder={placeholder_desc!r}")

        if raw_img_path:
            img_path, disk_path = resolve_disk_path(raw_img_path)
            heading = find_section_heading('_site_repo/src/content/docs', p['path'], img_path)
            under = f"Screenshot under the header {heading} potentially needs changing." if heading else "Screenshot potentially needs changing."
            under_html = f"Screenshot under the header <strong>{heading}</strong> potentially needs changing." if heading else "Screenshot potentially needs changing."
            text_screenshots += [f"      {under}", f"      Reason: {reason}"]
            if disk_path:
                mime_type = mimetypes.guess_type(disk_path)[0] or 'image/png'
                cid = f"img{cid_counter}"
                cid_counter += 1
                with open(disk_path, 'rb') as f:
                    encoded = base64.b64encode(f.read()).decode('ascii')
                attachments.append({
                    "content": encoded,
                    "type": mime_type,
                    "filename": os.path.basename(disk_path),
                    "disposition": "inline",
                    "content_id": cid,
                })
                html_imgs += (
                    f'<p style="margin:16px 0 4px">{under_html}<br>'
                    f'<strong>Reason:</strong> {reason}</p>'
                    f'<img src="cid:{cid}" alt="{img_path}" style="max-width:640px;border:1px solid #ddd;">'
                )
            else:
                html_imgs += (
                    f'<p style="margin:16px 0 4px">{under_html}<br>'
                    f'<strong>Reason:</strong> {reason}<br>'
                    f'<small style="color:#999">(image file not found in repo: {img_path})</small></p>'
                )
        else:
            desc = placeholder_desc or 'unnamed placeholder'
            heading = find_section_heading('_site_repo/src/content/docs', p['path'], desc)
            under = f"Screenshot under the header {heading} potentially needs changing." if heading else f"Screenshot ({desc}) potentially needs changing."
            under_html = f"Screenshot under the header <strong>{heading}</strong> potentially needs changing." if heading else f"Screenshot ({desc}) potentially needs changing."
            text_screenshots += [f"      {under}", f"      Reason: {reason}"]
            html_imgs += (
                f'<p style="margin:16px 0 4px">{under_html}<br>'
                f'<strong>Reason:</strong> {reason}<br>'
                f'<small style="color:#999">(no existing image — placeholder only)</small></p>'
            )

    text_lines += [f"file path: {file_path}"] + text_screenshots + [""]
    html_sections.append(
        f'<hr><p><strong>file path: {file_path}</strong></p>'
        + (html_imgs or '<p><em>No specific screenshots identified.</em></p>')
    )

text_lines += [
    "Please retake the relevant screenshots and commit them to:",
    "https://github.com/FASTR-Analytics/site",
    "",
    "This notification was sent automatically by the platform sync-docs workflow.",
]
html_body = (
    "<!DOCTYPE html><html><body>"
    "<p>The FASTR documentation site has been automatically updated to reflect recent platform changes.</p>"
    "<p>The following pages contain screenshots that may need retaking:</p>"
    + "".join(html_sections)
    + "<hr><p>Please retake the relevant screenshots and commit them to "
    '<a href="https://github.com/FASTR-Analytics/site">FASTR-Analytics/site</a>.</p>'
    "<p><small>Sent automatically by the platform sync-docs workflow.</small></p>"
    "</body></html>"
)

payload = {
    "personalizations": [{"to": [{"email": "nick@usefuldata.com.au"}]}],
    "from": {"email": sendgrid_from},
    "subject": "FASTR docs updated — screenshots need retaking",
    "content": [
        {"type": "text/plain", "value": "\n".join(text_lines)},
        {"type": "text/html",  "value": html_body},
    ],
}
if attachments:
    payload["attachments"] = attachments

json.dump(payload, open('/tmp/email_payload.json', 'w'))
print(f"Email payload ready ({len(attachments)} image(s) attached).")
print("\n".join(text_lines))
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
