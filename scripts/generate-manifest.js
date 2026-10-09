const fs = require('fs');
const path = require('path');

// Run from project root: node scripts/generate-manifest.js
const projectRoot = process.cwd();
const dataDir = path.join(projectRoot, 'data');

const manifest = {};

for (const kind of fs.readdirSync(dataDir)) {
  const kindPath = path.join(dataDir, kind);
  if (!fs.statSync(kindPath).isDirectory()) continue;
  
  const files = fs.readdirSync(kindPath)
    .filter(f => f.endsWith('.json'))
    .map(f => `data/${kind}/${f}`)
    .sort();
  
  if (files.length > 0) {
    manifest[kind] = files;
  }
}

fs.writeFileSync(
  path.join(projectRoot, 'data', 'manifest.json'),
  JSON.stringify(manifest, null, 2)
);

console.log('Generated manifest.json:', manifest);
