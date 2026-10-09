# toeic-keys
Answer keys of recent TOEIC tests.

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
# Enable git hooks
chmod +x .git/hooks/pre-commit
```

After this, every `git commit` will automatically update `manifest.json`.

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
```json
[
  {
    "id": "L001",
    "part": 1,
    "question": 1,
    "answer": "B",
    "image": "images/L001.jpg",
    "audio": "audio/L001.mp3"
  }
]
```

### Development
```bash
# Run locally
npx serve .

# Generate manifest manually
node scripts/generate-manifest.js
```
