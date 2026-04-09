# Deploy Script Fix: Git Push Rejection

## Problem

Running `sh deploy` would fail at the `git push` step with:

```
! [rejected] main -> main (fetch first)
error: failed to push some refs to 'https://github.com/FASTR-Analytics/platform.git'
```

## Root Cause

A GitHub Action (`.github/workflows/generate-changelog.yml`) runs on every push to main that touches TS files or VERSION. It generates a `CHANGELOG_AUTO.txt` update and pushes a commit (`chore: update CHANGELOG_AUTO.txt`) to the remote.

This means between two deploys, the remote always has one extra commit that the local repo doesn't have, causing the next `git push` to be rejected.

Adding `CHANGELOG_AUTO.txt` to `.gitignore` didn't help because the GitHub Action itself does `git add` and `git push` on the remote runner.

## Fix

Added a smart fetch-and-rebase step in the `deploy` script before `git push`:

1. Fetch remote main
2. If local is behind, check whether **all** remote-only commits are changelog commits (matching `chore: update CHANGELOG_AUTO.txt`)
3. If yes, rebase over them automatically
4. If there are any non-changelog commits, abort with details so you can review manually

This avoids silently accepting unexpected remote changes while still handling the predictable changelog commits automatically.

### Code Change

Replaced the bare `git push` in the `deploy` script with:

```bash
git fetch origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" != "$REMOTE" ]; then
    NON_CHANGELOG=$(git log "$LOCAL..$REMOTE" --format="%s" | grep -v "^chore: update CHANGELOG_AUTO.txt" || true)
    if [ -n "$NON_CHANGELOG" ]; then
        echo "ERROR: Remote has non-changelog commits. Review and pull manually:"
        git log "$LOCAL..$REMOTE" --oneline
        exit 1
    fi
    echo "Rebasing over changelog commit(s)..."
    if ! git pull --rebase; then
        echo "ERROR: Rebase failed!"
        exit 1
    fi
fi

if ! git push; then
    echo "ERROR: Git push failed!"
    exit 1
fi
```
