# toeic-keys

Answer keys of recent TOEIC tests. View online at: https://nghinm.github.io/toeic-keys

## Adding New Data Files

### Folder Structure
```
data/
├── manifest.json          # Auto-generated (do not edit manually)
├── listening/            # All listening test files
│   └── *.json
└── reading/              # All reading test files
    └── *.json
```

### Setup (One-time)

```bash
# Clone repo
git clone https://github.com/nghinm/toeic-keys.git
cd toeic-keys

# Enable git hooks (Node.js required)
node scripts/setup.js
```

Works on **Windows**, **Mac**, and **Linux**. After this, every `git commit` will automatically update `manifest.json`.

### How to Add

1. **Add JSON file** to `data/listening/` or `data/reading/`

2. **Commit changes:**
   ```bash
   git add .
   git commit -m "Add new test file"
   git push
   ```

   The `manifest.json` will be **automatically updated** by the pre-commit hook.

### JSON File Format

Each file is a **compact JSON array** (no pretty-print). Every record is an array of field values in fixed order (not an object with keys).

| Index | Field | Listening | Reading |
|-------|-------|-----------|---------|
| `[i][0]` | test-name | ✓ | ✓ |
| `[i][1]` | sub-category | ✓ | ✓ |
| `[i][2]` | category | ✓ | ✓ |
| `[i][3]` | first-image (object with `svg`) | ✓ | — |
| `[i][3]` | first-line (first-line string or array of first-lines) | — | ✓ |
| `[i][4]` | keys | ✓ | ✓ |

**Listening** (`data/listening/*.json`):
```json
[["TEST 1","2","HACKER",{"svg":"<svg>...</svg>"},["A","B"]]]
```

**Reading** (`data/reading/*.json`):
```json
[["TEST 1","2","HACKER","This is the first line of the passage",["Answer of question 1","Answer of questionn 2"]]]
```

### Development
```bash
# Run locally
npx serve .

# Generate manifest manually
node scripts/generate-manifest.js

# Setup git hooks
node scripts/setup.js
```
