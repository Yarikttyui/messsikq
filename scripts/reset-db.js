const path = require('path');
const mysql = require('mysql2/promise');
process.chdir(path.resolve(__dirname, '..'));
const config = require('../src/config');
const { initDb } = require('../src/db');
function escapeIdentifier(identifier) {
  if (typeof identifier !== 'string' || identifier.trim() === '') {
    throw new Error('Database name must be a non-empty string');
  }
  return '`' + identifier.replace(/`/g, '``') + '`';
}
(async () => {
  try {
    const adminConnection = await mysql.createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password
    });
    const databaseId = escapeIdentifier(config.db.database);
    console.log(`Dropping database ${config.db.database} if it exists...`);
    await adminConnection.query(`DROP DATABASE IF EXISTS ${databaseId}`);
    await adminConnection.end();
    console.log('Recreating schema...');
    await initDb();
    console.log('Database reset complete.');
    process.exit(0);
  } catch (error) {
    console.error('Database reset failed:', error);
    process.exit(1);
  }
})();
