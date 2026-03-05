'use strict';
const fs = require('fs');
const path = require('path');

const testFile = path.join(__dirname, '..', 'src', 'backend', '__tests__', 'agent-deliverables.test.js');
let content = fs.readFileSync(testFile, 'utf8');

// Replace the failing step count test with a CRLF-aware version
const oldPattern = /  test\('le pipeline full-specifications contient 4[^']*', \(\) => \{[\s\S]*?\r?\n  \}\);/;

const newTest = [
  "  test('le pipeline full-specifications contient 4 étapes', () => {",
  "    const afterId = src.split(\"id: 'full-specifications'\")[1] || '';",
  "    // Normalize line endings then extract the pipeline steps section",
  "    const normalized = afterId.replace(/\\r\\n/g, '\\n');",
  "    const endIdx = normalized.search(/\\n\\s{4}\\];\\s*\\n\\s{2}\\}/);",
  "    const section = endIdx !== -1 ? normalized.slice(0, endIdx) : normalized.slice(0, 2000);",
  "    // count step agent declarations: agent: 'xxx'",
  "    const stepCount = (section.match(/agent: '[a-z-]+'/g) || []).length;",
  "    expect(stepCount).toBe(4);",
  "  });"
].join('\r\n');

const result = content.replace(oldPattern, newTest);

if (result !== content) {
  fs.writeFileSync(testFile, result, 'utf8');
  console.log('Replacement SUCCEEDED');
} else {
  console.log('FAILED - pattern not found');
  // Debug: show what the current test looks like
  const match = content.match(oldPattern);
  console.log('Pattern match:', match ? 'yes, len=' + match[0].length : 'no');
}
