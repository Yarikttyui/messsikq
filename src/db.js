const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const config = require('./config');
let pool;
function escapeIdentifier(identifier) {
  if (typeof identifier !== 'string' || identifier.trim() === '') {
    throw new Error('Database name must be a non-empty string');
  }
  const sanitized = identifier.replace(/`/g, '``');
  return '`' + sanitized + '`';
}
function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
      timezone: 'Z'
    });
  }
  return pool;
}
async function initDb() {
  const adminConnection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password
  });
  const databaseId = escapeIdentifier(config.db.database);
  await adminConnection.query(
    `CREATE DATABASE IF NOT EXISTS ${databaseId} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await adminConnection.end();
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      public_id CHAR(16) NOT NULL UNIQUE,
      username VARCHAR(50) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      display_name VARCHAR(100) NOT NULL,
      avatar_color CHAR(7) NOT NULL,
      status_message VARCHAR(160) NOT NULL DEFAULT '',
      last_seen DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      share_code CHAR(12) NOT NULL UNIQUE,
      type ENUM('direct','group') NOT NULL DEFAULT 'group',
      title VARCHAR(100) NOT NULL,
      description TEXT NULL,
      avatar_attachment_id CHAR(36) NULL,
      avatar_url VARCHAR(255) NULL,
      creator_id INT NOT NULL,
      is_private TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS conversation_members (
      conversation_id INT NOT NULL,
      user_id INT NOT NULL,
      role ENUM('owner','admin','member') NOT NULL DEFAULT 'member',
      permissions JSON NOT NULL DEFAULT (JSON_OBJECT()),
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_read_at DATETIME NULL,
      notifications_enabled TINYINT(1) NOT NULL DEFAULT 1,
      PRIMARY KEY (conversation_id, user_id),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      conversation_id INT NOT NULL,
      user_id INT NOT NULL,
      content TEXT NULL,
      attachments JSON NULL,
      parent_id INT NULL,
      reply_snapshot JSON NULL,
      forwarded_from_message_id INT NULL,
      forward_metadata JSON NULL,
      is_edited TINYINT(1) NOT NULL DEFAULT 0,
      edited_at DATETIME NULL,
      deleted_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES messages(id) ON DELETE SET NULL,
      FOREIGN KEY (forwarded_from_message_id) REFERENCES messages(id) ON DELETE SET NULL,
      INDEX idx_messages_conversation_created_at (conversation_id, created_at DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS message_reactions (
      message_id INT NOT NULL,
      user_id INT NOT NULL,
      emoji VARCHAR(16) NOT NULL,
      reacted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (message_id, user_id, emoji),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS message_favorites (
      user_id INT NOT NULL,
      message_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, message_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS attachments (
      id CHAR(36) PRIMARY KEY,
      user_id INT NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      stored_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      size INT NOT NULL,
      kind VARCHAR(20) NOT NULL DEFAULT 'file',
      file_type VARCHAR(32) NULL,
      duration_ms INT NULL,
      waveform JSON NULL,
      is_circle TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_attachments_user_created (user_id, created_at DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS conversation_pins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      conversation_id INT NOT NULL,
      message_id INT NOT NULL,
      pinned_by INT NOT NULL,
      pinned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_conversation_message (conversation_id, message_id),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (pinned_by) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS conversation_folders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(60) NOT NULL,
      color CHAR(7) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS conversation_folder_items (
      folder_id INT NOT NULL,
      conversation_id INT NOT NULL,
      position INT NOT NULL DEFAULT 0,
      PRIMARY KEY (folder_id, conversation_id),
      FOREIGN KEY (folder_id) REFERENCES conversation_folders(id) ON DELETE CASCADE,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await ensureColumns();
  await ensureUploadsDir();
  await ensureSeedData();
}
async function ensureColumns() {
  const db = getPool();
  await ensureColumn(db, 'users', 'public_id', "ALTER TABLE users ADD COLUMN public_id CHAR(16) NOT NULL DEFAULT '' AFTER id");
  await ensureColumn(db, 'conversations', 'share_code', "ALTER TABLE conversations ADD COLUMN share_code CHAR(12) NOT NULL DEFAULT '' AFTER id");
  await ensureColumn(db, 'users', 'avatar_url', "ALTER TABLE users ADD COLUMN avatar_url VARCHAR(255) NULL AFTER avatar_color");
  await ensureColumn(db, 'users', 'bio', "ALTER TABLE users ADD COLUMN bio VARCHAR(500) NULL AFTER status_message");
  await ensureColumn(db, 'attachments', 'kind', "ALTER TABLE attachments ADD COLUMN kind VARCHAR(20) NOT NULL DEFAULT 'file' AFTER size");
  await ensureColumn(db, 'attachments', 'file_type', "ALTER TABLE attachments ADD COLUMN file_type VARCHAR(32) NULL AFTER kind");
  await ensureColumn(db, 'attachments', 'duration_ms', "ALTER TABLE attachments ADD COLUMN duration_ms INT NULL AFTER file_type");
  await ensureColumn(db, 'attachments', 'waveform', "ALTER TABLE attachments ADD COLUMN waveform JSON NULL AFTER duration_ms");
  await ensureColumn(db, 'attachments', 'is_circle', "ALTER TABLE attachments ADD COLUMN is_circle TINYINT(1) NOT NULL DEFAULT 0 AFTER waveform");
  await ensureColumn(db, 'conversations', 'avatar_attachment_id', "ALTER TABLE conversations ADD COLUMN avatar_attachment_id CHAR(36) NULL AFTER description");
  await ensureColumn(db, 'conversations', 'avatar_url', "ALTER TABLE conversations ADD COLUMN avatar_url VARCHAR(255) NULL AFTER avatar_attachment_id");
  await ensureColumn(db, 'conversation_members', 'permissions', "ALTER TABLE conversation_members ADD COLUMN permissions JSON NOT NULL DEFAULT (JSON_OBJECT()) AFTER role");
  await ensureColumn(db, 'conversation_members', 'notifications_enabled', "ALTER TABLE conversation_members ADD COLUMN notifications_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER last_read_at");
  await ensureColumn(db, 'messages', 'reply_snapshot', "ALTER TABLE messages ADD COLUMN reply_snapshot JSON NULL AFTER parent_id");
  await ensureColumn(db, 'messages', 'forwarded_from_message_id', "ALTER TABLE messages ADD COLUMN forwarded_from_message_id INT NULL AFTER reply_snapshot");
  await ensureColumn(db, 'messages', 'forward_metadata', "ALTER TABLE messages ADD COLUMN forward_metadata JSON NULL AFTER forwarded_from_message_id");
  await ensureIndex(db, 'attachments', 'idx_attachments_user_created', 'CREATE INDEX idx_attachments_user_created ON attachments (user_id, created_at)');
  await db.query("UPDATE attachments SET kind = 'file' WHERE kind IS NULL OR kind = ''");
  await db.query('UPDATE attachments SET is_circle = 0 WHERE is_circle IS NULL');
  await db.query('UPDATE conversation_members SET permissions = JSON_OBJECT() WHERE permissions IS NULL');
  await db.query(`
    UPDATE users
    SET public_id = CONCAT('U', UPPER(HEX(RANDOM_BYTES(5))))
    WHERE (public_id IS NULL OR public_id = '')
      AND id > 1
  `);
  await db.query(`
    UPDATE conversations
    SET share_code = CONCAT('C', UPPER(HEX(RANDOM_BYTES(5))))
    WHERE (share_code IS NULL OR share_code = '')
  `);
  await db.query('ALTER TABLE users MODIFY public_id CHAR(16) NOT NULL UNIQUE');
  await db.query('ALTER TABLE conversations MODIFY share_code CHAR(12) NOT NULL UNIQUE');
}
async function ensureColumn(db, table, column, alterSql) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [config.db.database, table, column]
  );
  if (rows[0].count === 0) {
    await db.query(alterSql);
  }
}
async function ensureUploadsDir() {
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}
async function ensureIndex(db, table, indexName, createSql) {
  const [indexRows] = await db.query(
    `SELECT COUNT(*) AS count FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [config.db.database, table, indexName]
  );
  if (!indexRows[0].count) {
    await db.query(createSql);
  }
}
async function ensureSeedData() {
  const db = getPool();
  const systemUser = {
    username: 'system',
    displayName: 'Pink Bot',
    avatarColor: '#ff4d6d',
    statusMessage: 'Always online',
    publicId: 'SYSTEMHOME0001'
  };
  const [systemRows] = await db.query('SELECT id FROM users WHERE username = ? LIMIT 1', [systemUser.username]);
  let systemUserId;
  if (!systemRows.length) {
    const [insert] = await db.query(
      'INSERT INTO users (public_id, username, password_hash, display_name, avatar_color, status_message) VALUES (?, ?, ?, ?, ?, ?)',
      [
        systemUser.publicId,
        systemUser.username,
        '$2b$10$iuyLeiMlA9.tY9..pE2ljuAhVWDtvHya38RdcyMJ9ZpOhkSQs0JXO',
        systemUser.displayName,
        systemUser.avatarColor,
        systemUser.statusMessage
      ]
    );
    systemUserId = insert.insertId;
  } else {
    systemUserId = systemRows[0].id;
    await db.query('UPDATE users SET public_id = ? WHERE id = ?', [systemUser.publicId, systemUserId]);
  }
  const communityConversation = {
    shareCode: 'PINKHOME01',
    title: 'Community Hub',
    description: 'Welcome to Pink Messenger'
  };
  const [conversationRows] = await db.query(
    'SELECT id FROM conversations WHERE share_code = ? LIMIT 1',
    [communityConversation.shareCode]
  );
  let conversationId;
  if (!conversationRows.length) {
    const [insertConversation] = await db.query(
      "INSERT INTO conversations (share_code, type, title, description, creator_id, is_private) VALUES (?, 'group', ?, ?, ?, 0)",
      [communityConversation.shareCode, communityConversation.title, communityConversation.description, systemUserId]
    );
    conversationId = insertConversation.insertId;
  } else {
    conversationId = conversationRows[0].id;
  }
  await db.query(
    'INSERT IGNORE INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)',
    [conversationId, systemUserId, 'owner']
  );
}
async function withTransaction(work) {
  const db = getPool();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
module.exports = { getPool, initDb, withTransaction };
