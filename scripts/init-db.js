const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const { initDb } = require('../src/db');
(async () => {
  try {
    await initDb();
    console.log('Database schema verified.');
    process.exit(0);
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
})();
