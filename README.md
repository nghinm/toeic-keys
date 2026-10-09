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

**Listening** (`data/listening/*.json`):
```json
[
  {
    "cat": "HACKER",
    "sub-cat": "2",
    "name": "TEST 1",
    "first_img": {
      "svg": "<svg>...</svg>"
    }
  }
]
```

**Reading** (`data/reading/*.json`):
```json
[
  {
    "cat": "HACKER",
    "sub-cat": "2",
    "name": "TEST 1",
    "fl": "Cardigan Bay General Hospital Fundraising Dinner",
    "keys": ["Answer 1", "Answer 2"]
  }
]
```

| Field | Listening | Reading | Required |
|-------|-----------|---------|----------|
| `cat` | ✓ | ✓ | Yes |
| `sub-cat` | ✓ | ✓ | Yes |
| `name` | ✓ | ✓ | Yes |
| `first_img.svg` | ✓ | ✗ | Listening only |
| `fl` | ✗ | ✓ | Reading only |
| `keys` | ✗ | ✓ | Reading only |

### Development
```bash
# Run locally
npx serve .

# Generate manifest manually
node scripts/generate-manifest.js

# Setup git hooks
node scripts/setup.js
```
