const { getPool, initDb } = require('../src/db');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setupAdmin() {
  try {
    console.log('🔧 Setting up admin panel...\n');
    await initDb();
    const pool = getPool();

    console.log('📦 Applying database migration...');
    
    try {
      const checkColumnsSQL = `
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'users' 
          AND COLUMN_NAME IN ('is_admin', 'is_blocked')
      `;
      
      const [existingColumns] = await pool.query(checkColumnsSQL);
      const hasIsAdmin = existingColumns.some(row => row.COLUMN_NAME === 'is_admin');
      const hasIsBlocked = existingColumns.some(row => row.COLUMN_NAME === 'is_blocked');
      
      if (!hasIsAdmin) {
        await pool.query('ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE');
        console.log('✅ Added is_admin column');
      } else {
        console.log('ℹ️  Column is_admin already exists');
      }
      
      if (!hasIsBlocked) {
        await pool.query('ALTER TABLE users ADD COLUMN is_blocked BOOLEAN DEFAULT FALSE');
        console.log('✅ Added is_blocked column');
      } else {
        console.log('ℹ️  Column is_blocked already exists');
      }
    } catch (err) {
      console.log('ℹ️  Columns check:', err.message);
    }

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS admin_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        admin_id INT,
        action VARCHAR(50) NOT NULL,
        target_user_id INT,
        target_conversation_id INT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (target_conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
      )
    `;

    await pool.query(createTableSQL);
    
    const indexesSQL = [
      'CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON admin_logs(admin_id)',
      'CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_users_is_blocked ON users(is_blocked)'
    ];

    for (const indexSQL of indexesSQL) {
      try {
        await pool.query(indexSQL);
      } catch (err) {
        if (!err.message.includes('Duplicate key name')) {
          console.log('ℹ️  Index warning:', err.message);
        }
      }
    }
    
    console.log('✅ Database migration completed\n');
    const [usersResult] = await pool.query(`
      SELECT id, username, display_name, is_admin 
      FROM users 
      ORDER BY created_at ASC
    `);

    if (usersResult.length === 0) {
      console.log('❌ No users found. Please register a user first, then run this script again.');
      rl.close();
      process.exit(0);
      return;
    }

    console.log('📋 Available users:');
    console.log('─────────────────────────────────────────────');
    usersResult.forEach((user, index) => {
      const adminBadge = user.is_admin ? ' [ADMIN]' : '';
      console.log(`${index + 1}. ${user.username || 'Unknown'} (ID: ${user.id})${adminBadge}`);
      if (user.display_name) console.log(`   Display Name: ${user.display_name}`);
      console.log('─────────────────────────────────────────────');
    });

    console.log('');
    const userIdInput = await question('Enter user ID to grant admin rights (or press Enter to skip): ');
    
    if (userIdInput.trim()) {
      const userId = parseInt(userIdInput.trim());
      
      const [userCheck] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
      
      if (userCheck.length === 0) {
        console.log('❌ User not found');
      } else {
        await pool.query('UPDATE users SET is_admin = TRUE WHERE id = ?', [userId]);
        console.log(`✅ User ${userCheck[0].username} (ID: ${userId}) is now an admin!`);
        console.log('');
        console.log('🎉 Admin panel is ready!');
        console.log(`📍 Access it at: http://localhost:8000/admin`);
        console.log('');
      }
    } else {
      console.log('ℹ️  No admin user created. You can run this script again later.');
    }

  } catch (error) {
    console.error('❌ Error setting up admin panel:', error.message);
  } finally {
    rl.close();
    process.exit(0);
  }
}

setupAdmin();
