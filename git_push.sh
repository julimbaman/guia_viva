#!/bin/bash
set -e

# Masking token from script itself by using the environment variable directly.
if [ -z "$AI_STUDIO_GITHUB" ]; then
  echo "Error: AI_STUDIO_GITHUB environment variable is empty."
  exit 1
fi

echo "1. git init"
git init

echo "2. git config user.email"
git config user.email "julio.camacho@woobsing.com"

echo "3. git config user.name"
git config user.name "Julio Camacho"

echo "4. git remote add origin"
git remote add origin "https://oauth2:${AI_STUDIO_GITHUB}@github.com/julimbaman/guia_viva.git"

echo "5. git fetch origin"
git fetch origin

echo "6. git add -A"
git add -A

echo "7. git commit"
# We might have nothing to commit if everything is identical or we just initialized, but since we downloaded a zip, there are files.
git commit -m "Adopt AI Studio workspace state" || echo "Nothing to commit or commit failed"

echo "8. git branch -m main"
git branch -m main

echo "9. git merge"
git merge -X ours origin/main --allow-unrelated-histories -m "Merge GitHub history" || {
  echo "Conflict occurred, resolving with local files (-X ours didn't auto-resolve everything, e.g., added by both)..."
  git add -A
  git commit -m "Merge GitHub history (resolved conflicts)"
}

echo "10. git push"
git push origin main

# Cleanup remote url to not leave the token in .git/config
git remote set-url origin "https://github.com/julimbaman/guia_viva.git"
echo "Done."
