const fs = require('fs');

function checkDuplicateKeys(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const seenKeys = new Map();
  let depth = 0;
  seenKeys.set(0, new Set());

  // Tokenize object braces and keys to detect duplicate keys within any object scope
  const regex = /"((?:\\.|[^"\\])*)"\s*:|([{}])/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (match[2] === '{') {
      depth++;
      seenKeys.set(depth, new Set());
    } else if (match[2] === '}') {
      seenKeys.delete(depth);
      depth--;
    } else if (match[1] !== undefined) {
      const key = match[1];
      const currentLevel = seenKeys.get(depth);
      if (currentLevel) {
        if (currentLevel.has(key)) {
          throw new Error(`Duplicate key "${key}" found in ${filePath}`);
        }
        currentLevel.add(key);
      }
    }
  }
}

const files = process.argv.slice(2);
for (const file of files) {
  try {
    checkDuplicateKeys(file);
    console.log(`✓ ${file} has no duplicate keys`);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
}
