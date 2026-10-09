#!/bin/bash
# Setup git hooks for auto-generating manifest.json
# Run this once after cloning the repo

cd "$(git rev-parse --show-toplevel)"

# Create symlink to hook
ln -sf ../../.git/hooks/pre-commit .git/hooks/pre-commit 2>/dev/null || cp scripts/pre-commit .git/hooks/pre-commit

chmod +x .git/hooks/pre-commit

echo "✅ Git hooks enabled! manifest.json will auto-generate on commit."
