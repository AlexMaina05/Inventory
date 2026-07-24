const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// If called as worker process:
if (process.argv[2] === 'worker') {
  const dbPath = process.argv[3];
  const barcode = process.argv[4];
  const count = parseInt(process.argv[5], 10);
  const workerId = process.argv[6];

  const { initDatabase, upsertItem } = require('../src/db');
  const db = initDatabase(dbPath);

  try {
    for (let i = 0; i < count; i++) {
      upsertItem(db, { barcode, name: `MultiProc Item ${workerId}`, quantity: 1 });
    }
    db.close();
    process.exit(0);
  } catch (err) {
    console.error(`Worker ${workerId} error:`, err);
    process.exit(1);
  }
}

// If called as main launcher:
async function runMultiProcessTest() {
  const dbPath = path.join(os.tmpdir(), `multiproc_test_${Date.now()}.db`);
  const BARCODE = 'MULTIPROC-001';
  const NUM_WORKERS = 5;
  const REQUESTS_PER_WORKER = 50;

  // Initialize DB in main process
  const { initDatabase, getItemByBarcode } = require('../src/db');
  const mainDb = initDatabase(dbPath);

  // Spawn workers simultaneously
  const workers = [];
  for (let w = 0; w < NUM_WORKERS; w++) {
    const child = fork(__filename, ['worker', dbPath, BARCODE, String(REQUESTS_PER_WORKER), String(w + 1)]);
    workers.push(new Promise((resolve, reject) => {
      child.on('exit', code => {
        if (code === 0) resolve();
        else reject(new Error(`Worker ${w + 1} exited with code ${code}`));
      });
    }));
  }

  await Promise.all(workers);

  // Verify final count in database
  const item = getItemByBarcode(mainDb, BARCODE);
  const expectedQty = NUM_WORKERS * REQUESTS_PER_WORKER; // 5 * 50 = 250

  console.log(`Multi-process Test Result: item.quantity = ${item ? item.quantity : 'NULL'}, expected = ${expectedQty}`);

  mainDb.close();

  // Clean up
  try { fs.unlinkSync(dbPath); } catch (_) {}
  try { fs.unlinkSync(`${dbPath}-wal`); } catch (_) {}
  try { fs.unlinkSync(`${dbPath}-shm`); } catch (_) {}

  if (!item || item.quantity !== expectedQty) {
    console.error(`FAILED: expected ${expectedQty}, got ${item ? item.quantity : 0}`);
    process.exit(1);
  } else {
    console.log('SUCCESS: Multi-process concurrency test passed without lost updates or lock errors!');
    process.exit(0);
  }
}

if (require.main === module && process.argv[2] !== 'worker') {
  runMultiProcessTest().catch(err => {
    console.error('Multi-process runner failed:', err);
    process.exit(1);
  });
}

module.exports = { runMultiProcessTest };
