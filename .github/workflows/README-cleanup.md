# PR Bundle Cleanup Workflow

## Overview

The `cleanup-pr-bundle.yml` workflow automatically removes PR update bundles from GitHub Pages when a PR is closed (merged or unmerged).

## How It Works

1. **Trigger**: Runs when any PR targeting `main` is closed
2. **Remove Directory**: Deletes `updates/pr-{number}/` from gh-pages branch
3. **Regenerate Manifest**: Updates `updates/manifest.json` to exclude the removed PR
4. **Regenerate Index**: Updates `index.html` to reflect the current PR list
5. **Notify**: Posts a comment on the PR confirming cleanup

## Edge Cases Handled

### 1. No gh-pages Branch

If the gh-pages branch doesn't exist, the workflow exits gracefully without error.

```bash
if ! git ls-remote --exit-code --heads origin gh-pages; then
  echo "gh-pages branch doesn't exist, nothing to clean up"
  exit 0
fi
```

### 2. Directory Already Removed

If the PR's directory doesn't exist (manual deletion, previous cleanup), exits gracefully.

```bash
if [ ! -d "updates/pr-${PR_NUMBER}" ]; then
  echo "PR #${PR_NUMBER} directory doesn't exist, nothing to clean up"
  exit 0
fi
```

### 3. Last PR Removed

When the last PR is removed, generates an empty manifest with valid JSON:

```json
{
  "updates": []
}
```

The index.html handles this gracefully by showing an "empty state" message.

### 4. Concurrent Operations

Uses retry logic (3 attempts) with rebase to handle concurrent cleanups:

```bash
for i in {1..3}; do
  if git push origin gh-pages; then
    break
  else
    git pull --rebase origin gh-pages
    rm -rf "updates/pr-${PR_NUMBER}" || true
    git add -A
  fi
done
```

### 5. Race Conditions

Concurrency group ensures only one cleanup per PR runs at a time:

```yaml
concurrency:
  group: pages-cleanup-pr-${{ github.event.pull_request.number }}
  cancel-in-progress: false
```

## Testing Locally

To test the cleanup logic locally:

```bash
# Set up test environment
mkdir -p /tmp/test-cleanup/updates
cd /tmp/test-cleanup

# Create test PR directories
for pr in 100 123 150; do
  mkdir -p "updates/pr-${pr}"
  echo '{"prNumber":'${pr}',"prTitle":"Test"}' > "updates/pr-${pr}/pr-metadata.json"
done

# Test removal
PR_NUMBER=123
rm -rf "updates/pr-${PR_NUMBER}"

# Generate manifest
cat > updates/manifest.json << 'EOF'
{
  "updates": [
EOF

FIRST=true
for pr_dir in updates/pr-*/; do
  if [ -d "$pr_dir" ] && [ -f "${pr_dir}pr-metadata.json" ]; then
    if [ "$FIRST" = true ]; then
      FIRST=false
    else
      echo "," >> updates/manifest.json
    fi
    cat "${pr_dir}pr-metadata.json" | jq -c '.' >> updates/manifest.json
  fi
done

echo "  ]" >> updates/manifest.json
echo "}" >> updates/manifest.json

# Verify
cat updates/manifest.json | jq '.'
```

## Relationship to publish-pr-update.yml

Both workflows:

- Use the same git operations pattern (fetch, checkout, commit, push)
- Generate identical `manifest.json` and `index.html` files
- Include retry logic for push conflicts
- Use the same concurrency strategy (different groups)

This ensures consistency whether bundles are being added or removed.

## Limitations

1. **Artifacts Not Deleted**: GitHub Actions artifacts remain for their retention period (30 days). Only the GitHub Pages deployment is cleaned up.

2. **No Cascade Delete**: If multiple PRs are closed simultaneously, each runs independently. The manifest will be regenerated multiple times but eventually converge to the correct state.

3. **Manual Cleanup Required For**: Workflows don't clean up if:
   - PR was closed before this workflow was added
   - Workflow was disabled when PR closed
   - gh-pages branch was force-pushed/reset

## Future Enhancements

Potential improvements:

- Add a scheduled workflow to verify manifest consistency
- Support manual workflow dispatch for cleanup by PR number
- Add metrics/logging for cleanup operations
- Consider archiving old bundles instead of deleting
