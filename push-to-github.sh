#!/bin/bash
set -e

REPO_URL="https://github.com/swapnildagliya/shoonya-website.git"
BRANCH="main"

echo "── schooljaar.shoonyadance.com · GitHub Pages deploy ──"

if [ ! -d ".git" ]; then
  echo "→ Initialising git repo..."
  git init
  git branch -M "$BRANCH"
fi

if git remote get-url origin &>/dev/null; then
  echo "→ Remote: $(git remote get-url origin)"
else
  echo "→ Adding remote origin..."
  git remote add origin "$REPO_URL"
fi

echo "→ Staging all files..."
git add -A

TIMESTAMP=$(date "+%Y-%m-%d %H:%M")
echo "→ Committing: deploy $TIMESTAMP"
git commit -m "deploy $TIMESTAMP" 2>/dev/null || echo "  (nothing new to commit)"

echo "→ Pushing to $BRANCH..."
git push -u origin "$BRANCH"

echo ""
echo "✓ Done — schooljaar.shoonyadance.com should update within ~60 seconds."
