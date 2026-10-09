const fs = require('fs');
const path = require('path');

// Run from project root: node scripts/generate-manifest.js
const projectRoot = process.cwd();
const dataDir = path.join(projectRoot, 'data');

// Load a JSON file and extract its category
function getCategoryFromFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    if (Array.isArray(data) && data.length > 0 && data[0].cat) {
      return data[0].cat;
    }
    return 'Unknown';
  } catch (e) {
    return 'Unknown';
  }
}

const manifest = {};

// For each data subfolder (listening, reading)
for (const kind of fs.readdirSync(dataDir)) {
  const kindPath = path.join(dataDir, kind);
  if (!fs.statSync(kindPath).isDirectory()) continue;
  
  const categories = {};
  
  const files = fs.readdirSync(kindPath)
    .filter(f => f.endsWith('.json'))
    .sort();
  
  for (const file of files) {
    const filePath = path.join(kindPath, file);
    const cat = getCategoryFromFile(filePath);
    
    if (!categories[cat]) {
      categories[cat] = [];
    }
    categories[cat].push(`data/${kind}/${file}`);
  }
  
  if (Object.keys(categories).length > 0) {
    manifest[kind] = categories;
  }
}

fs.writeFileSync(
  path.join(projectRoot, 'data', 'manifest.json'),
  JSON.stringify(manifest, null, 2)
);

console.log('Generated manifest.json:', JSON.stringify(manifest, null, 2));
