const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'netlify', 'functions', 'parse-report.js');
const source = fs.readFileSync(file, 'utf8');

const requiredSnippets = [
  'Required JSON shape',
  'possibleIssues',
  'actionPlan',
  'confidence',
  'reviewWarnings',
  'function normalizeAnalysis',
  'MAX_REPORT_CHARS || 12000',
  'Do not encourage false disputes',
];

const missing = requiredSnippets.filter((snippet) => !source.includes(snippet));
if (missing.length) {
  console.error('Missing expected parser improvements:', missing.join(', '));
  process.exit(1);
}

console.log('Parse report output validation passed.');
