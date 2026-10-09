/**
 * Setup git hooks for auto-generating manifest.json
 * Works on Windows, Mac, and Linux
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const hooksDir = path.join(projectRoot, '.git', 'hooks');
const hookSource = path.join(projectRoot, 'scripts', 'pre-commit');
const hookDest = path.join(hooksDir, 'pre-commit');

console.log('🔧 Setting up git hooks...\n');

// Check if hook source exists
if (!fs.existsSync(hookSource)) {
  console.error('❌ Error: scripts/pre-commit not found');
  process.exit(1);
}

// Copy hook to .git/hooks
try {
  fs.copyFileSync(hookSource, hookDest);
  console.log('✅ Copied pre-commit hook to .git/hooks/');
} catch (e) {
  console.error('❌ Failed to copy hook:', e.message);
  process.exit(1);
}

// Make executable (Unix only)
if (process.platform !== 'win32') {
  try {
    fs.chmodSync(hookDest, '755');
    console.log('✅ Made hook executable');
  } catch (e) {
    // Ignore - Windows doesn't need chmod
  }
}

console.log('\n✅ Git hooks enabled!');
console.log('   manifest.json will auto-generate on every commit.\n');
