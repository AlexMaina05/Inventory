const Module = require('module');
const orig = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'better-sqlite3') {
    throw new Error('Simulated missing better-sqlite3');
  }
  return orig.apply(this, arguments);
};

const { run } = require('node:test');
const path = require('path');

const appDir = path.resolve(__dirname, '../../app');
const testFiles = [
  path.join(appDir, 'tests/db.test.js'),
  path.join(appDir, 'tests/upsert.test.js'),
  path.join(appDir, 'tests/concurrency.test.js')
];

let failed = 0;
let passed = 0;

run({ files: testFiles })
  .on('test:pass', (t) => {
    if (!t.name.startsWith('tests/')) {
      passed++;
      console.log(`PASS: ${t.name}`);
    }
  })
  .on('test:fail', (t) => {
    failed++;
    console.error(`FAIL: ${t.name}`, t.details?.error);
  })
  .on('end', () => {
    console.log(`\nFallback Test Summary: ${passed} passed, ${failed} failed.`);
    process.exit(failed > 0 ? 1 : 0);
  });
