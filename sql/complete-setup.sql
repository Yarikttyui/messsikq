DROP DATABASE IF EXISTS pink_messenger;

CREATE DATABASE pink_messenger CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE pink_messenger;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  public_id VARCHAR(10) UNIQUE NOT NULL,
  avatar VARCHAR(255) DEFAULT NULL,
  color VARCHAR(7) DEFAULT '#6366f1',
  avatar_color VARCHAR(7) DEFAULT '#6366f1',
  status VARCHAR(50) DEFAULT 'active',
  status_message VARCHAR(160) NOT NULL DEFAULT '',
  bio VARCHAR(500) NULL,
  last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
  show_last_seen BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_username (username),
  INDEX idx_public_id (public_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  share_code CHAR(12) NOT NULL UNIQUE,
  type ENUM('direct','group') NOT NULL DEFAULT 'group',
  title VARCHAR(100) NOT NULL,
  description TEXT NULL,
  avatar_attachment_id CHAR(36) NULL,
  avatar_url VARCHAR(255) NULL,
  background_data JSON DEFAULT NULL,
  creator_id INT NOT NULL,
  is_private TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_type (type),
  INDEX idx_creator_id (creator_id),
  INDEX idx_share_code (share_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE conversation_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  user_id INT NOT NULL,
  role ENUM('owner', 'admin', 'member') DEFAULT 'member',
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_read_at DATETIME DEFAULT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_member (conversation_id, user_id),
  INDEX idx_conversation (conversation_id),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  user_id INT NOT NULL,
  content TEXT DEFAULT NULL,
  attachments JSON DEFAULT NULL,
  parent_id INT DEFAULT NULL,
  reply_to_id INT DEFAULT NULL,
  reply_snapshot JSON DEFAULT NULL,
  forwarded_from_message_id INT DEFAULT NULL,
  forward_metadata JSON DEFAULT NULL,
  edited_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES messages(id) ON DELETE SET NULL,
  FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL,
  INDEX idx_conversation (conversation_id),
  INDEX idx_user (user_id),
  INDEX idx_parent (parent_id),
  INDEX idx_reply_to (reply_to_id),
  INDEX idx_created_at (created_at),
  FULLTEXT INDEX idx_content_fulltext (content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_profiles (
  user_id INT PRIMARY KEY,
  bio TEXT DEFAULT NULL,
  status VARCHAR(100) DEFAULT NULL,
  mood VARCHAR(50) DEFAULT NULL,
  theme VARCHAR(20) DEFAULT 'default',
  privacy_status ENUM('everyone', 'contacts', 'nobody') DEFAULT 'everyone',
  privacy_photos ENUM('everyone', 'contacts', 'nobody') DEFAULT 'everyone',
  privacy_last_seen ENUM('everyone', 'contacts', 'nobody') DEFAULT 'everyone',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_gallery (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  url VARCHAR(255) NOT NULL,
  caption VARCHAR(255) DEFAULT NULL,
  position INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_position (user_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE message_reactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL,
  user_id INT NOT NULL,
  emoji VARCHAR(10) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_reaction (message_id, user_id, emoji),
  INDEX idx_message (message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE pinned_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  message_id INT NOT NULL,
  pinned_by INT NOT NULL,
  pinned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (pinned_by) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_pinned (conversation_id, message_id),
  INDEX idx_conversation (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_blocks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  blocker_id INT NOT NULL,
  blocked_id INT NOT NULL,
  blocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_block (blocker_id, blocked_id),
  INDEX idx_blocker (blocker_id),
  INDEX idx_blocked (blocked_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE conversation_user_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  user_id INT NOT NULL,
  background TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_conversation (conversation_id, user_id),
  INDEX idx_conversation (conversation_id),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE attachments (
  id CHAR(36) PRIMARY KEY,
  user_id INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size BIGINT NOT NULL,
  kind ENUM('image', 'video', 'audio', 'file') NOT NULL,
  is_circle TINYINT(1) DEFAULT 0,
  duration_ms INT DEFAULT NULL,
  waveform TEXT DEFAULT NULL,
  file_type VARCHAR(50) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE conversation_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  user_id INT DEFAULT NULL,
  data JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_events_conversation_created (conversation_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE conversation_invites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  code CHAR(12) UNIQUE NOT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  max_uses INT DEFAULT NULL,
  use_count INT NOT NULL DEFAULT 0,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_invites_code (code),
  INDEX idx_invites_conversation (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
