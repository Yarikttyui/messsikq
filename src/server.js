const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const { body, query, param, validationResult } = require('express-validator');
const { Server } = require('socket.io');
const multer = require('multer');
const { v4: uuid } = require('uuid');
const dayjs = require('dayjs');
const { initDb, getPool, withTransaction } = require('./db');
const config = require('./config');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
});
const pool = getPool();
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const ALLOWED_MIME_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  audio: ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav'],
  video: ['video/webm', 'video/mp4', 'video/quicktime']
};
const MAX_PINNED_MESSAGES = 5;
const ADMIN_PERMISSION_KEYS = ['manageMembers', 'manageSettings', 'moderateMessages'];
const ADMIN_PERMISSION_CATALOG = [
  {
    key: 'manageMembers',
    label: 'Member Management',
    description: 'Invite, remove and promote participants'
  },
  {
    key: 'manageSettings',
    label: 'Conversation Settings',
    description: 'Edit conversation title, description, privacy and notifications'
  },
  {
    key: 'moderateMessages',
    label: 'Moderation',
    description: 'Pin, delete and edit messages from other participants'
  }
];
const DEFAULT_ADMIN_PERMISSIONS = {
  manageMembers: true,
  manageSettings: true,
  moderateMessages: false
};
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${uuid().replace(/-/g, '')}${extension}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (isAllowedMimeType(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type is not allowed'));
    }
  }
});
app.set('trust proxy', 1);
app.use(morgan('dev'));
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    if (origin.includes('.cloudpub.ru')) {
      return callback(null, true);
    }
    if (config.publicUrl && origin === config.publicUrl) {
      return callback(null, true);
    }
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(uploadsDir, { maxAge: '1d' }));
app.use('/node_modules', express.static(path.join(process.cwd(), 'node_modules')));

// Админ-панель - статические файлы
app.use('/admin/styles', express.static(path.join(process.cwd(), 'admin', 'styles')));
app.use('/admin/scripts', express.static(path.join(process.cwd(), 'admin', 'scripts')));

app.use(express.static(path.join(process.cwd(), 'public')));
app.get('/favicon.ico', (req, res) => {
  res.type('image/svg+xml');
  res.sendFile(path.join(process.cwd(), 'public', 'favicon.svg'));
});

// Админ-панель - главная страница
app.get('/admin', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'admin', 'views', 'index.html'));
});

app.get('/api/client-config', (req, res) => {
  const { jitsi = {} } = config;
  res.json({
    jitsi: {
      domain: jitsi.domain || '',
      roomPrefix: jitsi.roomPrefix || 'pink'
    }
  });
});
app.get('/api/admin-permissions', authGuard, (req, res) => {
  res.json({ catalog: ADMIN_PERMISSION_CATALOG });
});

const USER_PALETTE = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Sky Blue
  '#FFA07A', // Light Salmon
  '#98D8C8', // Mint
  '#F7DC6F', // Yellow
  '#BB8FCE', // Purple
  '#85C1E2', // Light Blue
  '#F8B739', // Orange
  '#52B788', // Green
  '#E06377', // Pink
  '#5DADE2', // Dodger Blue
  '#AF7AC5', // Amethyst
  '#58D68D', // Emerald
  '#EC7063', // Coral
  '#AED6F1', // Baby Blue
  '#F5B7B1', // Light Pink
  '#A9DFBF', // Light Green
  '#FAD7A0', // Peach
  '#D7BDE2'  // Lavender
];
function pickAvatarColor() {
  return USER_PALETTE[Math.floor(Math.random() * USER_PALETTE.length)];
}
function tokenForUser(userId) {
  return jwt.sign({ id: userId }, config.jwtSecret, { expiresIn: '14d' });
}
function validationProblem(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }
  return next();
}
async function generateUserCode() {
  while (true) {
    const candidate = `U${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    const [rows] = await pool.query('SELECT id FROM users WHERE public_id = ? LIMIT 1', [candidate]);
    if (!rows.length) return candidate;
  }
}
async function generateConversationCode() {
  while (true) {
    const candidate = `C${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    const [rows] = await pool.query('SELECT id FROM conversations WHERE share_code = ? LIMIT 1', [candidate]);
    if (!rows.length) return candidate;
  }
}
async function ensureDirectConversationBetween(currentUserId, targetUser) {
  const [existing] = await pool.query(
    `SELECT c.id
     FROM conversations c
     JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ?
     JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ?
     WHERE c.type = 'direct'
     LIMIT 1`,
    [currentUserId, targetUser.id]
  );
  let conversationId;
  let created = false;
  if (existing.length) {
    conversationId = existing[0].id;
  } else {
    const shareCode = await generateConversationCode();
    const [result] = await pool.query(
      'INSERT INTO conversations (share_code, type, title, description, creator_id, is_private, avatar_attachment_id, avatar_url) VALUES (?, \'direct\', ?, ?, ?, 1, NULL, NULL)',
      [
        shareCode,
        targetUser.display_name || targetUser.username,
        `������ ��� � ${targetUser.display_name || targetUser.username}`,
        currentUserId
      ]
    );
    conversationId = result.insertId;
    await pool.query(
      'INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?), (?, ?, ?)',
      [conversationId, currentUserId, 'owner', conversationId, targetUser.id, 'member']
    );
    created = true;
  }
  const conversation = await fetchConversationById(conversationId);
  const membersList = await fetchConversationMembers(conversationId);
  const payloadFor = (userId) => {
    const member = membersList.find((m) => m.id === userId);
    return buildConversationPayload(conversation, membersList, {
      role: member?.role || (userId === currentUserId ? 'owner' : 'member'),
      notifications_enabled: 1
    });
  };
  const payload = payloadFor(currentUserId);
  joinUserToConversationSockets(currentUserId, conversationId);
  joinUserToConversationSockets(targetUser.id, conversationId);
  if (created) {
    await emitConversationUpdate(conversationId, [currentUserId, targetUser.id]);
    emitToUser(currentUserId, 'conversation:created', { conversation: payload });
    emitToUser(targetUser.id, 'conversation:created', { conversation: payloadFor(targetUser.id) });
  }
  return { conversationId, created, payload };
}
async function findUserByUsername(username) {
  const [rows] = await pool.query(
    'SELECT id, public_id, username, password_hash, display_name, avatar_color, status_message, avatar_url, bio, last_seen FROM users WHERE username = ? LIMIT 1',
    [username]
  );
  return rows[0] || null;
}
async function findUserByPublicId(publicId) {
  const [rows] = await pool.query(
    'SELECT id, public_id, username, display_name, avatar_color, status_message, avatar_url, bio, last_seen FROM users WHERE public_id = ? LIMIT 1',
    [publicId]
  );
  return rows[0] || null;
}
async function findUserById(id) {
  const [rows] = await pool.query(
    'SELECT id, public_id, username, display_name, avatar_color, status_message, avatar_url, bio, last_seen FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
}
function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    publicId: row.public_id,
    username: row.username,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
    avatarUrl: row.avatar_url || null,
    statusMessage: row.status_message,
    bio: row.bio,
    lastSeen: row.last_seen
  };
}
function mapConversation(row) {
  const lastMessage = safeJsonParse(row.last_message);
  const avatarStoredName = row.avatar_stored_name || row.avatarStoredName;
  const avatarUrl = row.avatar_url || (avatarStoredName ? `/uploads/${avatarStoredName}` : null);
  const membershipRole = row.membership_role || row.member_role || row.role || null;
  const membershipPermissions =
    membershipRole === 'owner'
      ? fullPermissionSet()
      : normalizePermissionShape(
          row.membership_permissions || row.permissions,
          membershipRole === 'admin' ? DEFAULT_ADMIN_PERMISSIONS : {}
        );
  const notificationsRaw = row.notifications_enabled;
  return {
    id: row.id,
    shareCode: row.share_code,
    type: row.type,
    title: row.title,
    description: row.description,
    avatarAttachmentId: row.avatar_attachment_id || null,
    avatarUrl,
    isPrivate: Boolean(row.is_private),
    creatorId: row.creator_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessage,
    unreadCount: row.unread_count ? Number(row.unread_count) : 0,
    memberCount: row.member_count ? Number(row.member_count) : 0,
    membershipRole,
    membershipPermissions,
    notificationsEnabled:
      notificationsRaw === undefined || notificationsRaw === null ? true : Boolean(notificationsRaw)
  };
}
function buildConversationPayload(conversationRow, members, membership) {
  const mapped = mapConversation(conversationRow);
  return {
    ...mapped,
    members,
    membershipRole: membership?.role || mapped.membershipRole || null,
    membershipPermissions:
      membership?.role === 'owner'
        ? fullPermissionSet()
        : membership?.permissions || mapped.membershipPermissions || normalizePermissionShape(null, {}),
    notificationsEnabled:
      membership?.notifications_enabled === undefined
        ? mapped.notificationsEnabled
        : Boolean(membership.notifications_enabled)
  };
}
function mapAttachment(row) {
  if (!row) return null;
  return normalizeAttachment({
    id: row.id,
    stored_name: row.stored_name,
    file_name: row.file_name,
    mime_type: row.mime_type,
    size: row.size,
    kind: row.kind,
    is_circle: row.is_circle,
    duration_ms: row.duration_ms,
    waveform: row.waveform,
    file_type: row.file_type
  });
}
function normalizeAttachment(payload) {
  if (!payload) return null;
  const mimeType = payload.mimeType || payload.mime_type || '';
  const waveform = payload.waveform ? safeJsonParse(payload.waveform) : null;
  const durationRaw = payload.durationMs ?? payload.duration_ms;
  const parsedDuration = Number(durationRaw);
  const durationMs = Number.isFinite(parsedDuration) && parsedDuration >= 0 ? parsedDuration : null;
  return {
    id: payload.id,
    url: payload.url || (payload.stored_name ? `/uploads/${payload.stored_name}` : null),
    originalName: payload.originalName || payload.file_name || null,
    mimeType,
    size: payload.size ?? payload.file_size ?? null,
    kind: payload.kind || detectAttachmentKind(mimeType),
    isCircle: Boolean(payload.isCircle ?? payload.is_circle ?? false),
    durationMs,
    waveform,
    fileType: payload.fileType || payload.file_type || null
  };
}
function mapMessage(row, currentUserId) {
  const attachmentsRaw = safeJsonParse(row.attachments, []);
  const attachments = Array.isArray(attachmentsRaw)
    ? attachmentsRaw.map((item) => normalizeAttachment(item)).filter(Boolean)
    : [];
  const reactions = safeJsonParse(row.reactions, []);
  const replySnapshot = safeJsonParse(row.reply_snapshot);
  const forwardMetadata = safeJsonParse(row.forward_metadata);
  return {
    id: row.id,
    conversationId: row.conversation_id,
    user: {
      id: row.user_id,
      publicId: row.public_id,
      username: row.username,
      displayName: row.display_name,
      avatarColor: row.avatar_color,
      avatarUrl: row.avatar_url
    },
    content: row.deleted_at ? null : row.content,
    attachments,
    parentId: row.parent_id,
    replyTo: replySnapshot
      ? {
          id: replySnapshot.id,
          content: replySnapshot.content || null,
          attachments: Array.isArray(replySnapshot.attachments) ? replySnapshot.attachments : [],
          user: replySnapshot.user || null
        }
      : null,
    forwardedFrom: forwardMetadata
      ? {
          messageId: row.forwarded_from_message_id || forwardMetadata.messageId || null,
          conversationId: forwardMetadata.conversationId || null,
          user: forwardMetadata.user || null,
          createdAt: forwardMetadata.createdAt || null
        }
      : null,
    isEdited: Boolean(row.is_edited),
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    reactions: reactions.map((reaction) => ({
      emoji: reaction.emoji,
      count: reaction.count,
      reacted: reaction.userIds.includes(currentUserId)
    })),
    isFavorite: Boolean(row.is_favorite),
    pinnedAt: row.pinned_at || null,
    pinnedBy:
      row.pinned_by
        ? {
            id: row.pinned_by,
            displayName: row.pinned_by_display_name || null,
            username: row.pinned_by_username || null,
            publicId: row.pinned_by_public_id || null
          }
        : null
  };
}
function safeJsonParse(value, fallback = null) {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === 'object') {
    return value;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      console.warn('Failed to parse JSON value', error);
      return fallback;
    }
  }
  return fallback;
}
function fullPermissionSet() {
  return ADMIN_PERMISSION_KEYS.reduce((acc, key) => {
    acc[key] = true;
    return acc;
  }, {});
}
function normalizePermissionShape(raw, fallback = {}) {
  const base = ADMIN_PERMISSION_KEYS.reduce((acc, key) => {
    acc[key] = Boolean(fallback[key]);
    return acc;
  }, {});
  if (raw === null || raw === undefined) {
    return base;
  }
  let parsed = raw;
  if (typeof raw === 'string' || typeof raw === 'object') {
    parsed = safeJsonParse(raw, raw);
  }
  if (Array.isArray(parsed)) {
    parsed.forEach((key) => {
      if (ADMIN_PERMISSION_KEYS.includes(String(key))) {
        base[key] = true;
      }
    });
  } else if (parsed && typeof parsed === 'object') {
    ADMIN_PERMISSION_KEYS.forEach((key) => {
      if (typeof parsed[key] === 'boolean') {
        base[key] = parsed[key];
      }
    });
  }
  return base;
}
function hasPermission(membership, key) {
  if (!membership) return false;
  if (membership.role === 'owner') return true;
  if (membership.role !== 'admin') return false;
  return Boolean(membership.permissions?.[key]);
}
function serializePermissionsForStore(permissions) {
  const normalized = normalizePermissionShape(permissions, {});
  return JSON.stringify(normalized);
}
async function fetchConversationMembers(conversationId) {
  const [rows] = await pool.query(
    `SELECT cm.user_id, cm.role, cm.permissions, u.public_id, u.username, u.display_name, u.avatar_color, u.avatar_url, u.status_message, u.bio, u.last_seen
     FROM conversation_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.conversation_id = ?
     ORDER BY u.display_name`,
    [conversationId]
  );
  return rows.map((row) => ({
    id: row.user_id,
    publicId: row.public_id,
    username: row.username,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
    avatarUrl: row.avatar_url,
    statusMessage: row.status_message,
    bio: row.bio,
    role: row.role,
    permissions:
      row.role === 'owner'
        ? fullPermissionSet()
        : normalizePermissionShape(row.permissions, row.role === 'admin' ? DEFAULT_ADMIN_PERMISSIONS : {}),
    lastSeen: row.last_seen
  }));
}
async function fetchConversationList(userId) {
  const [rows] = await pool.query(
    `SELECT c.*, ca.stored_name AS avatar_stored_name, ca.file_name AS avatar_file_name, ca.mime_type AS avatar_mime_type,
            json_object('id', m.id, 'content', m.content, 'createdAt', m.created_at,
      'user', json_object('id', u.id, 'publicId', u.public_id, 'displayName', u.display_name, 'username', u.username, 'avatarUrl', u.avatar_url, 'avatarColor', u.avatar_color)) AS last_message,
            IFNULL(uc.unread_count, 0) AS unread_count,
            cm.role AS membership_role,
            cm.permissions AS membership_permissions,
            cm.notifications_enabled,
            IFNULL(mc.member_count, 0) AS member_count
     FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id
     LEFT JOIN attachments ca ON ca.id = c.avatar_attachment_id
     LEFT JOIN (
       SELECT m1.conversation_id, m1.id, m1.content, m1.created_at, m1.user_id
       FROM messages m1
       JOIN (
         SELECT conversation_id, MAX(created_at) AS created_at
         FROM messages
         GROUP BY conversation_id
       ) lm ON lm.conversation_id = m1.conversation_id AND lm.created_at = m1.created_at
     ) m ON m.conversation_id = c.id
  LEFT JOIN users u ON u.id = m.user_id
     LEFT JOIN (
       SELECT m.conversation_id,
              SUM(CASE WHEN cm.last_read_at IS NULL OR m.created_at > cm.last_read_at THEN 1 ELSE 0 END) AS unread_count
       FROM messages m
       JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
       GROUP BY m.conversation_id
  ) uc ON uc.conversation_id = c.id
     LEFT JOIN (
       SELECT conversation_id, COUNT(*) AS member_count
       FROM conversation_members
       GROUP BY conversation_id
     ) mc ON mc.conversation_id = c.id
     WHERE cm.user_id = ?
     ORDER BY c.updated_at DESC, c.id DESC`,
    [userId, userId]
  );
  return rows.map(mapConversation);
}
async function fetchConversationById(conversationId) {
  const [rows] = await pool.query(
    `SELECT c.*, ca.stored_name AS avatar_stored_name, ca.file_name AS avatar_file_name, ca.mime_type AS avatar_mime_type
     FROM conversations c
     LEFT JOIN attachments ca ON ca.id = c.avatar_attachment_id
     WHERE c.id = ?
     LIMIT 1`,
    [conversationId]
  );
  return rows[0] || null;
}
async function ensureMembership(conversationId, userId) {
  const [rows] = await pool.query(
    'SELECT role, notifications_enabled, permissions FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1',
    [conversationId, userId]
  );
  if (!rows.length) return null;
  const membership = rows[0];
  membership.permissions =
    membership.role === 'owner'
      ? fullPermissionSet()
      : normalizePermissionShape(
          membership.permissions,
          membership.role === 'admin' ? DEFAULT_ADMIN_PERMISSIONS : {}
        );
  return membership;
}
async function fetchMessageById(messageId, currentUserId) {
  const [rows] = await pool.query(
    `SELECT m.*, u.public_id, u.username, u.display_name, u.avatar_color, u.avatar_url,
            (
              SELECT JSON_ARRAYAGG(JSON_OBJECT('emoji', emoji, 'userIds', user_ids, 'count', cnt))
              FROM (
                SELECT emoji,
                       COUNT(*) AS cnt,
                       JSON_ARRAYAGG(user_id) AS user_ids
                FROM message_reactions
                WHERE message_id = m.id
                GROUP BY emoji
              ) r
            ) AS reactions,
            EXISTS(
              SELECT 1 FROM message_favorites mf
              WHERE mf.message_id = m.id AND mf.user_id = ?
            ) AS is_favorite,
            (
              SELECT JSON_OBJECT(
                'id', rm.id,
                'content', rm.content,
                'user', JSON_OBJECT(
                  'id', ru.id,
                  'username', ru.username,
                  'displayName', ru.display_name,
                  'avatarUrl', ru.avatar_url,
                  'avatarColor', ru.avatar_color
                )
              )
              FROM messages rm
              JOIN users ru ON ru.id = rm.user_id
              WHERE rm.id = m.reply_to_id
              LIMIT 1
            ) AS reply_snapshot
     FROM messages m
     JOIN users u ON u.id = m.user_id
     WHERE m.id = ?
     LIMIT 1`,
    [currentUserId, messageId]
  );
  return rows[0] ? mapMessage(rows[0], currentUserId) : null;
}
async function fetchMessages(conversationId, currentUserId, options = {}) {
  const limit = Math.min(Number(options.limit) || 30, 200);
  const beforeId = options.before ? Number(options.before) : null;
  const params = [currentUserId, conversationId];
  let condition = '';
  if (beforeId) {
    condition = 'AND m.id < ?';
    params.push(beforeId);
  }
  params.push(limit);
  const [rows] = await pool.query(
    `SELECT m.*, u.public_id, u.username, u.display_name, u.avatar_color, u.avatar_url,
            (
              SELECT JSON_ARRAYAGG(JSON_OBJECT('emoji', emoji, 'userIds', user_ids, 'count', cnt))
              FROM (
                SELECT emoji, COUNT(*) AS cnt, JSON_ARRAYAGG(user_id) AS user_ids
                FROM message_reactions
                WHERE message_id = m.id
                GROUP BY emoji
              ) r
            ) AS reactions,
            EXISTS(
              SELECT 1 FROM message_favorites mf
              WHERE mf.message_id = m.id AND mf.user_id = ?
            ) AS is_favorite,
            (
              SELECT JSON_OBJECT(
                'id', rm.id,
                'content', rm.content,
                'user', JSON_OBJECT(
                  'id', ru.id,
                  'username', ru.username,
                  'displayName', ru.display_name,
                  'avatarUrl', ru.avatar_url,
                  'avatarColor', ru.avatar_color
                )
              )
              FROM messages rm
              JOIN users ru ON ru.id = rm.user_id
              WHERE rm.id = m.reply_to_id
              LIMIT 1
            ) AS reply_snapshot
     FROM messages m
     JOIN users u ON u.id = m.user_id
     WHERE m.conversation_id = ? ${condition}
     ORDER BY m.id DESC
     LIMIT ?`,
    params
  );
  return rows.reverse().map((row) => mapMessage(row, currentUserId));
}
async function fetchPinnedMessages(conversationId, currentUserId) {
  const [rows] = await pool.query(
    `SELECT m.*, u.public_id, u.username, u.display_name, u.avatar_color, u.avatar_url,
            (
              SELECT JSON_ARRAYAGG(JSON_OBJECT('emoji', emoji, 'userIds', user_ids, 'count', cnt))
              FROM (
                SELECT emoji, COUNT(*) AS cnt, JSON_ARRAYAGG(user_id) AS user_ids
                FROM message_reactions
                WHERE message_id = m.id
                GROUP BY emoji
              ) r
            ) AS reactions,
            EXISTS(
              SELECT 1 FROM message_favorites mf
              WHERE mf.message_id = m.id AND mf.user_id = ?
            ) AS is_favorite,
            cp.pinned_at, cp.pinned_by,
            pu.display_name AS pinned_by_display_name,
            pu.username AS pinned_by_username,
            pu.public_id AS pinned_by_public_id
     FROM conversation_pins cp
     JOIN messages m ON m.id = cp.message_id
     JOIN users u ON u.id = m.user_id
     LEFT JOIN users pu ON pu.id = cp.pinned_by
     WHERE cp.conversation_id = ?
     ORDER BY cp.pinned_at DESC
     LIMIT 20`,
    [currentUserId, conversationId]
  );
  return rows.map((row) => mapMessage(row, currentUserId));
}
async function fetchFavoriteMessages(userId) {
  const [rows] = await pool.query(
    `SELECT mf.message_id
     FROM message_favorites mf
     JOIN messages m ON m.id = mf.message_id
     WHERE mf.user_id = ? AND m.user_id = ?
     ORDER BY mf.created_at DESC
     LIMIT 200`,
    [userId, userId]
  );
  if (!rows.length) return [];
  const messages = await Promise.all(rows.map((row) => fetchMessageById(row.message_id, userId)));
  return messages.filter(Boolean);
}
async function broadcastPinnedMessages(conversationId) {
  const members = await fetchConversationMembers(conversationId);
  await Promise.all(
    members.map(async (member) => {
      const pins = await fetchPinnedMessages(conversationId, member.id);
      emitToUser(member.id, 'conversation:pins', { conversationId, pins });
    })
  );
}
async function fetchFolders(userId) {
  const [folders] = await pool.query(
    'SELECT id, title, color FROM conversation_folders WHERE user_id = ? ORDER BY title',
    [userId]
  );
  if (!folders.length) return [];
  const folderIds = folders.map((folder) => folder.id);
  const [items] = await pool.query(
    'SELECT folder_id, conversation_id FROM conversation_folder_items WHERE folder_id IN (?) ORDER BY position, conversation_id',
    [folderIds]
  );
  const grouped = new Map();
  items.forEach((item) => {
    if (!grouped.has(item.folder_id)) {
      grouped.set(item.folder_id, []);
    }
    grouped.get(item.folder_id).push(item.conversation_id);
  });
  return folders.map((folder) => ({
    id: folder.id,
    title: folder.title,
    color: folder.color,
    conversations: grouped.get(folder.id) || []
  }));
}
async function emitFoldersUpdate(userId) {
  const folders = await fetchFolders(userId);
  emitToUser(userId, 'folders:update', { folders });
}
async function updateConversationTimestamp(conversationId) {
  await pool.query('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [conversationId]);
}
async function attachFiles(userId, attachmentIds = []) {
  if (!attachmentIds.length) return [];
  const [rows] = await pool.query(
    `SELECT * FROM attachments WHERE id IN (?) AND user_id = ?`,
    [attachmentIds, userId]
  );
  return rows.map(mapAttachment);
}
function emitToUser(userId, event, payload) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  sockets.forEach((socket) => socket.emit(event, payload));
}
function joinUserToConversationSockets(userId, conversationId) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  sockets.forEach((socket) => {
    if (!socket.data.conversations) {
      socket.data.conversations = new Set();
    }
    if (!socket.data.conversations.has(conversationId)) {
      socket.data.conversations.add(conversationId);
    }
    socket.join(`conversation:${conversationId}`);
  });
}
function leaveUserFromConversationSockets(userId, conversationId) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  sockets.forEach((socket) => {
    socket.leave(`conversation:${conversationId}`);
    socket.data.conversations?.delete(conversationId);
  });
}
function leaveCall(conversationId, socket) {
  const callState = activeCalls.get(conversationId);
  const userId = socket.data.user?.id;
  if (!callState || !userId) return;
  const entry = callState.get(userId);
  socket.leave(`call:${conversationId}`);
  socket.data.activeCalls?.delete(conversationId);
  if (!entry) {
    if (!callState.size) {
      activeCalls.delete(conversationId);
    }
    return;
  }
  entry.sockets.delete(socket.id);
  if (!entry.sockets.size) {
    callState.delete(userId);
    socket.to(`call:${conversationId}`).emit('call:user-left', { conversationId, userId });
  }
  if (!callState.size) {
    activeCalls.delete(conversationId);
  }
}
function forceLeaveCall(conversationId, userId) {
  const callState = activeCalls.get(conversationId);
  if (!callState) return;
  const entry = callState.get(userId);
  if (!entry) return;
  entry.sockets.forEach((socketId) => {
    const targetSocket = io.sockets.sockets.get(socketId);
    if (targetSocket) {
      targetSocket.leave(`call:${conversationId}`);
      targetSocket.data.activeCalls?.delete(conversationId);
    }
  });
  callState.delete(userId);
  io.to(`call:${conversationId}`).emit('call:user-left', { conversationId, userId });
  if (!callState.size) {
    activeCalls.delete(conversationId);
  }
}
async function emitConversationUpdate(conversationId, userIds = null) {
  let targets = userIds;
  if (!targets || !targets.length) {
    const members = await fetchConversationMembers(conversationId);
    targets = members.map((member) => member.id);
  }
  await Promise.all(
    targets.map(async (userId) => {
      const conversations = await fetchConversationList(userId);
      emitToUser(userId, 'conversation:list', conversations);
    })
  );
}
async function markConversationRead(conversationId, userId) {
  await pool.query(
    'UPDATE conversation_members SET last_read_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND user_id = ?',
    [conversationId, userId]
  );
}
function isAllowedMimeType(mimeType) {
  const base = (mimeType || '').split(';')[0];
  return Object.values(ALLOWED_MIME_TYPES).some((group) => group.includes(base));
}
function detectAttachmentKind(mimeType) {
  const base = (mimeType || '').split(';')[0];
  if (ALLOWED_MIME_TYPES.image.includes(base)) return 'image';
  if (ALLOWED_MIME_TYPES.audio.includes(base)) return 'audio';
  if (ALLOWED_MIME_TYPES.video.includes(base)) return 'video';
  return 'file';
}
function isValidHexColor(value) {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value.trim());
}
function tryStringifyWaveform(raw) {
  if (!raw) return null;
  try {
    if (Array.isArray(raw)) {
      return JSON.stringify(raw.slice(0, 256));
    }
    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return JSON.stringify(parsed.slice(0, 256));
      }
      return raw;
    }
    if (typeof raw === 'object') {
      if (Array.isArray(raw.values)) {
        return JSON.stringify(raw.values.slice(0, 256));
      }
      return JSON.stringify(raw);
    }
  } catch (error) {
    console.warn('Failed to stringify waveform', error);
  }
  return null;
}
function authGuard(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.auth = { id: payload.id };
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Authentication token is invalid or expired' });
  }
}
app.post(
  '/api/register',
  body('username')
    .isLength({ min: 3, max: 32 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can contain Latin letters, numbers, and underscores'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  validationProblem,
  async (req, res) => {
    try {
      const username = String(req.body.username || '').trim().toLowerCase();
      const password = String(req.body.password || '');
      const existing = await findUserByUsername(username);
      if (existing) {
        return res.status(409).json({ message: 'This username is already taken' });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const avatarColor = pickAvatarColor();
      const publicId = await generateUserCode();
      const [result] = await pool.query(
        'INSERT INTO users (public_id, username, password_hash, display_name, avatar_color) VALUES (?, ?, ?, ?, ?)',
        [publicId, username, passwordHash, username, avatarColor]
      );
      const userId = result.insertId;
      const [defaults] = await pool.query('SELECT id FROM conversations WHERE share_code = ? LIMIT 1', ['PINKHOME01']);
      if (defaults.length) {
        await pool.query(
          'INSERT IGNORE INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)',
          [defaults[0].id, userId, 'member']
        );
      }
      const token = tokenForUser(userId);
      const user = await findUserById(userId);
      return res.status(201).json({ token, user: mapUser(user) });
    } catch (error) {
      console.error('Register error', error);
      if (error?.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'This username is already taken' });
      }
      return res.status(500).json({ message: 'Failed to complete registration' });
    }
  }
);
app.post(
  '/api/login',
  body('username').notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validationProblem,
  async (req, res) => {
    try {
      const username = String(req.body.username || '').trim().toLowerCase();
      const password = String(req.body.password || '');
      const user = await findUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: 'Invalid username or password' });
      }
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ message: 'Invalid username or password' });
      }
      const token = tokenForUser(user.id);
      return res.json({ token, user: mapUser(user) });
    } catch (error) {
      console.error('Login error', error);
      return res.status(500).json({ message: 'Failed to complete login' });
    }
  }
);
app.get('/api/profile', authGuard, async (req, res) => {
  const user = await findUserById(req.auth.id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  const conversations = await fetchConversationList(req.auth.id);
  return res.json({ user: mapUser(user), conversations });
});
app.get('/api/users/:id', authGuard, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }
    const user = await findUserById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json({ user: mapUser(user) });
  } catch (error) {
    console.error('Failed to get user:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
app.put(
  '/api/profile',
  authGuard,
  body('displayName').optional().isLength({ min: 2, max: 60 }),
  body('statusMessage').optional().isLength({ max: 160 }),
  body('bio').optional().isLength({ max: 500 }),
  body('avatarAttachmentId').optional().isUUID(),
  body('removeAvatar').optional().isBoolean().toBoolean(),
  validationProblem,
  async (req, res) => {
    try {
      const updates = [];
      const params = [];
      if (typeof req.body.displayName === 'string') {
        const displayName = req.body.displayName.trim();
        if (!displayName) {
          return res.status(400).json({ message: 'Display name is required' });
        }
        const [clashes] = await pool.query(
          'SELECT id FROM users WHERE LOWER(display_name) = LOWER(?) AND id != ? LIMIT 1',
          [displayName, req.auth.id]
        );
        if (clashes.length) {
          return res.status(409).json({ message: 'This display name is already in use' });
        }
        updates.push('display_name = ?');
        params.push(displayName);
      }
      if (typeof req.body.statusMessage === 'string') {
        updates.push('status_message = ?');
        params.push(req.body.statusMessage.trim());
      }
      if (typeof req.body.bio === 'string') {
        updates.push('bio = ?');
        params.push(req.body.bio.trim());
      }
      const attachmentId = typeof req.body.avatarAttachmentId === 'string' ? req.body.avatarAttachmentId.trim() : '';
      let avatarApplied = false;
      if (attachmentId) {
        const [files] = await pool.query(
          'SELECT stored_name FROM attachments WHERE id = ? AND user_id = ? LIMIT 1',
          [attachmentId, req.auth.id]
        );
        if (!files.length) {
          return res.status(400).json({ message: '���� ��� ������� �� ������' });
        }
        updates.push('avatar_url = ?');
        params.push(`/uploads/${files[0].stored_name}`);
        avatarApplied = true;
      }
      const removeAvatar = req.body.removeAvatar === true;
      if (!avatarApplied && removeAvatar) {
        updates.push('avatar_url = NULL');
      }
      if (!updates.length) {
        const user = await findUserById(req.auth.id);
        return res.json({ user: mapUser(user) });
      }
      params.push(req.auth.id);
      await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
      const user = await findUserById(req.auth.id);
      emitToUser(req.auth.id, 'profile:update', mapUser(user));
      return res.json({ user: mapUser(user) });
    } catch (error) {
      console.error('Profile update error', error);
      return res.status(500).json({ message: '�� ������� �������� �������' });
    }
  }
);
app.get(
  '/api/users/search',
  authGuard,
  query('q').isLength({ min: 1 }).withMessage('������� ���� �� ���� ������'),
  validationProblem,
  async (req, res) => {
    const term = String(req.query.q || '').trim();
    const like = `%${term}%`;
    const likeUpper = `%${term.toUpperCase()}%`;
    const [rows] = await pool.query(
      `SELECT id, public_id, username, display_name, avatar_color, avatar_url, status_message, bio
       FROM users
       WHERE (username LIKE ? OR display_name LIKE ? OR UPPER(public_id) LIKE ? OR UPPER(public_id) = ?)
         AND id != ?
       ORDER BY display_name ASC
       LIMIT 30`,
      [like, like, likeUpper, term.toUpperCase(), req.auth.id]
    );
    return res.json({ users: rows.map(mapUser) });
  }
);
app.get(
  '/api/users/by-code/:code',
  authGuard,
  param('code').isLength({ min: 4 }),
  validationProblem,
  async (req, res) => {
    const user = await findUserByPublicId(String(req.params.code).trim());
    if (!user) {
      return res.status(404).json({ message: '������������ �� ������' });
    }
    return res.json({ user: mapUser(user) });
  }
);
app.post('/api/users/:id/avatar', authGuard, upload.single('avatar'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (userId !== req.auth.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    if (!req.file.mimetype.startsWith('image/')) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Only images are allowed' });
    }
    const filename = req.file.filename;
    const avatarUrl = `/uploads/${filename}`;
    await pool.query(
      `UPDATE users SET avatar_url = ? WHERE id = ?`,
      [avatarUrl, userId]
    );
    const user = await findUserById(userId);
    return res.json({ 
      message: 'Avatar uploaded successfully',
      user: mapUser(user)
    });
  } catch (error) {
    console.error('Failed to upload avatar:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
app.get('/api/users/:id/profile', authGuard, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }
    const user = await findUserById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const [profileRows] = await pool.query(
      `SELECT bio, status, mood, theme, privacy_status, privacy_photos, privacy_last_seen
       FROM user_profiles WHERE user_id = ?`,
      [userId]
    );
    const profile = profileRows[0] || {
      bio: null, status: null, mood: null, theme: 'default',
      privacy_status: 'everyone', privacy_photos: 'everyone', privacy_last_seen: 'everyone'
    };
    const [galleryRows] = await pool.query(
      `SELECT id, url, caption, position, created_at
       FROM user_gallery WHERE user_id = ?
       ORDER BY position ASC, created_at DESC LIMIT 20`,
      [userId]
    );
    return res.json({
      profile: {
        user_id: user.id, username: user.username, display_name: user.display_name,
        avatar_url: user.avatar_url, avatar_color: user.avatar_color,
        bio: profile.bio, status: profile.status, mood: profile.mood, theme: profile.theme,
        privacy_status: profile.privacy_status, privacy_photos: profile.privacy_photos,
        privacy_last_seen: profile.privacy_last_seen, gallery: galleryRows
      }
    });
  } catch (error) {
    console.error('Failed to get profile:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
app.put('/api/users/:id/profile', authGuard,
  body('bio').optional().isLength({ max: 500 }),
  body('status').optional().isLength({ max: 100 }),
  body('mood').optional().isLength({ max: 50 }),
  body('theme').optional().isIn(['default', 'dark', 'light', 'auto']),
  body('privacy_status').optional().isIn(['everyone', 'contacts', 'nobody']),
  body('privacy_photos').optional().isIn(['everyone', 'contacts', 'nobody']),
  body('privacy_last_seen').optional().isIn(['everyone', 'contacts', 'nobody']),
  validationProblem,
  async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (userId !== req.auth.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const updates = [];
      const params = [];
      if (typeof req.body.bio === 'string') { updates.push('bio = ?'); params.push(req.body.bio.trim()); }
      if (typeof req.body.status === 'string') { updates.push('status = ?'); params.push(req.body.status.trim()); }
      if (typeof req.body.mood === 'string') { updates.push('mood = ?'); params.push(req.body.mood.trim()); }
      if (req.body.theme) { updates.push('theme = ?'); params.push(req.body.theme); }
      if (req.body.privacy_status) { updates.push('privacy_status = ?'); params.push(req.body.privacy_status); }
      if (req.body.privacy_photos) { updates.push('privacy_photos = ?'); params.push(req.body.privacy_photos); }
      if (req.body.privacy_last_seen) { updates.push('privacy_last_seen = ?'); params.push(req.body.privacy_last_seen); }
      if (updates.length > 0) {
        params.push(userId);
        await pool.query(`UPDATE user_profiles SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`, params);
      }
      const [profileRows] = await pool.query(
        `SELECT bio, status, mood, theme, privacy_status, privacy_photos, privacy_last_seen FROM user_profiles WHERE user_id = ?`,
        [userId]
      );
      return res.json({ profile: profileRows[0] });
    } catch (error) {
      console.error('Failed to update profile:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);
app.post('/api/users/block', authGuard, body('userId').isInt(), validationProblem, async (req, res) => {
  try {
    const blockerId = req.auth.id;
    const blockedId = parseInt(req.body.userId);
    if (blockerId === blockedId) {
      return res.status(400).json({ message: 'Cannot block yourself' });
    }
    await pool.query(`INSERT IGNORE INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?)`, [blockerId, blockedId]);
    return res.json({ message: 'User blocked successfully' });
  } catch (error) {
    console.error('Failed to block user:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
app.delete('/api/users/block/:userId', authGuard, async (req, res) => {
  try {
    await pool.query(`DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?`, [req.auth.id, parseInt(req.params.userId)]);
    return res.json({ message: 'User unblocked successfully' });
  } catch (error) {
    console.error('Failed to unblock user:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
app.get(
  '/api/conversations/:id',
  authGuard,
  param('id').isInt(),
  validationProblem,
  async (req, res) => {
    const conversationId = Number(req.params.id);
    const membership = await ensureMembership(conversationId, req.auth.id);
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const conversationRow = await fetchConversationById(conversationId);
    if (!conversationRow) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    const members = await fetchConversationMembers(conversationId);
    const conversation = buildConversationPayload(conversationRow, members, membership);
    return res.json({
      conversation,
      permissionCatalog: ADMIN_PERMISSION_CATALOG,
      membership: {
        role: membership.role,
        permissions: membership.role === 'owner' ? fullPermissionSet() : membership.permissions,
        notificationsEnabled:
          membership.notifications_enabled === undefined ? true : Boolean(membership.notifications_enabled)
      }
    });
  }
);
app.get('/api/conversations', authGuard, async (req, res) => {
  const conversations = await fetchConversationList(req.auth.id);
  return res.json({ conversations });
});
app.post(
  '/api/conversations',
  authGuard,
  body('title').isLength({ min: 3, max: 100 }),
  body('description').optional().isLength({ max: 500 }),
  body('isPrivate').optional().isBoolean(),
  body('members').optional().isArray(),
  validationProblem,
  async (req, res) => {
    const { title, description = '', isPrivate = false, members = [] } = req.body;
    try {
      const memberUsernames = Array.from(new Set(members.map((m) => String(m).toLowerCase())));
      const memberRows = memberUsernames.length
        ? await pool.query('SELECT id, username FROM users WHERE username IN (?)', [memberUsernames]).then(([rows]) => rows)
        : [];
      const memberIds = memberRows.map((row) => row.id).filter((id) => id !== req.auth.id);
      const shareCode = await generateConversationCode();
      const conversationId = await withTransaction(async (conn) => {
        const [result] = await conn.query(
          'INSERT INTO conversations (share_code, type, title, description, creator_id, is_private) VALUES (?, \'group\', ?, ?, ?, ?)',
          [shareCode, title, description, req.auth.id, isPrivate ? 1 : 0]
        );
        const newConversationId = result.insertId;
        await conn.query(
          'INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)',
          [newConversationId, req.auth.id, 'owner']
        );
        if (memberIds.length) {
          const values = memberIds.map(() => '(?, ?, ?)').join(',');
          const params = memberIds.flatMap((id) => [newConversationId, id, 'member']);
          await conn.query(`INSERT IGNORE INTO conversation_members (conversation_id, user_id, role) VALUES ${values}`, params);
        }
        return newConversationId;
      });
      await updateConversationTimestamp(conversationId);
      const conversation = await fetchConversationById(conversationId);
      const membersList = await fetchConversationMembers(conversationId);
      const targets = [req.auth.id, ...memberIds];
      targets.forEach((userId) => joinUserToConversationSockets(userId, conversationId));
      await emitConversationUpdate(conversationId, targets);
      const payloadFor = (userId) => {
        const member = membersList.find((m) => m.id === userId);
        return buildConversationPayload(conversation, membersList, {
          role: member?.role || (userId === req.auth.id ? 'owner' : 'member'),
          notifications_enabled: 1
        });
      };
      targets.forEach((userId) => {
        emitToUser(userId, 'conversation:created', {
          conversation: payloadFor(userId)
        });
      });
      return res.status(201).json({ conversation: payloadFor(req.auth.id) });
    } catch (error) {
      console.error('Create conversation error', error);
      return res.status(500).json({ message: 'Не удалось создать беседу' });
    }
  }
);
app.post(
  '/api/conversations/direct',
  authGuard,
  body('username').optional().isString(),
  body('userId').optional().isInt(),
  validationProblem,
  async (req, res) => {
    try {
      let targetUser;
      if (req.body.username) {
        const username = String(req.body.username).trim().toLowerCase();
        targetUser = await findUserByUsername(username);
      } else if (req.body.userId) {
        targetUser = await findUserById(req.body.userId);
      }
      if (!targetUser) {
        return res.status(404).json({ message: 'Пользователь не найден' });
      }
      if (targetUser.id === req.auth.id) {
        return res.status(400).json({ message: 'Нельзя создать чат с самим собой' });
      }
      const result = await ensureDirectConversationBetween(req.auth.id, targetUser);
      return res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      console.error('Create direct conversation error', error);
      return res.status(500).json({ message: 'Не удалось создать чат' });
    }
  }
);
app.post('/api/conversations/:id/read', authGuard, param('id').isInt(), validationProblem, async (req, res) => {
  const conversationId = Number(req.params.id);
  const membership = await ensureMembership(conversationId, req.auth.id);
  if (!membership) {
    return res.status(403).json({ message: 'Доступ закрыт' });
  }
  await markConversationRead(conversationId, req.auth.id);
  await emitConversationUpdate(conversationId, [req.auth.id]);
  return res.json({ ok: true });
});
app.get(
  '/api/conversations/:id/members',
  authGuard,
  param('id').isInt(),
  validationProblem,
  async (req, res) => {
    const conversationId = Number(req.params.id);
    const membership = await ensureMembership(conversationId, req.auth.id);
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const members = await fetchConversationMembers(conversationId);
    return res.json({ members });
  }
);
app.post(
  '/api/conversations/:id/members',
  authGuard,
  param('id').isInt(),
  body('username').isLength({ min: 3 }),
  validationProblem,
  async (req, res) => {
    const conversationId = Number(req.params.id);
    const membership = await ensureMembership(conversationId, req.auth.id);
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (!hasPermission(membership, 'manageMembers')) {
      return res.status(403).json({ message: 'Only conversation managers can invite participants' });
    }
    const username = String(req.body.username || '').trim().toLowerCase();
    if (!username) {
      return res.status(400).json({ message: 'Username is required' });
    }
    const user = await findUserByUsername(username);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    await pool.query(
      'INSERT IGNORE INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)',
      [conversationId, user.id, 'member']
    );
    joinUserToConversationSockets(user.id, conversationId);
    const members = await fetchConversationMembers(conversationId);
    await emitConversationUpdate(conversationId, members.map((m) => m.id));
    emitToUser(user.id, 'conversation:member-added', { conversationId, members });
    return res.status(201).json({ members });
  }
);
app.patch(
  '/api/conversations/:id/members/:userId/role',
  authGuard,
  param('id').isInt(),
  param('userId').isInt(),
  body('role').isIn(['admin', 'member']),
  validationProblem,
  async (req, res) => {
    const conversationId = Number(req.params.id);
    const targetUserId = Number(req.params.userId);
    const newRole = req.body.role;
    const membership = await ensureMembership(conversationId, req.auth.id);
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (membership.role !== 'owner') {
      return res.status(403).json({ message: 'Only owner can change roles' });
    }
    const targetMembership = await ensureMembership(conversationId, targetUserId);
    if (!targetMembership) {
      return res.status(404).json({ message: 'User not in conversation' });
    }
    if (targetMembership.role === 'owner') {
      return res.status(400).json({ message: 'Cannot change owner role' });
    }
    if (targetUserId === req.auth.id) {
      return res.status(400).json({ message: 'Cannot change own role' });
    }
    await pool.query(
      'UPDATE conversation_members SET role = ? WHERE conversation_id = ? AND user_id = ?',
      [newRole, conversationId, targetUserId]
    );
    const members = await fetchConversationMembers(conversationId);
    await emitConversationUpdate(conversationId, members.map((m) => m.id));
    res.json({ success: true });
  }
);
app.delete(
  '/api/conversations/:id/members/:userId',
  authGuard,
  param('id').isInt(),
  param('userId').isInt(),
  validationProblem,
  async (req, res) => {
    const conversationId = Number(req.params.id);
    const targetUserId = Number(req.params.userId);
    const membership = await ensureMembership(conversationId, req.auth.id);
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const targetMembership = await ensureMembership(conversationId, targetUserId);
    const selfRemoval = targetUserId === req.auth.id;
    if (!selfRemoval) {
      if (targetMembership?.role === 'owner') {
        return res.status(400).json({ message: 'Cannot remove the conversation owner' });
      }
      if (!hasPermission(membership, 'manageMembers')) {
        return res.status(403).json({ message: 'Only conversation managers can remove participants' });
      }
    }
    await pool.query('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [conversationId, targetUserId]);
    forceLeaveCall(conversationId, targetUserId);
    leaveUserFromConversationSockets(targetUserId, conversationId);
    await pool.query(
      `DELETE fi FROM conversation_folder_items fi
       JOIN conversation_folders f ON f.id = fi.folder_id
       WHERE fi.conversation_id = ? AND f.user_id = ?`,
      [conversationId, targetUserId]
    );
    if (selfRemoval) {
      await emitFoldersUpdate(req.auth.id);
    }
    const members = await fetchConversationMembers(conversationId);
    await emitConversationUpdate(conversationId, members.map((m) => m.id));
    emitToUser(targetUserId, 'conversation:member-removed', { conversationId });
    return res.json({ members });
  }
);
app.post(
  '/api/conversations/:id/admins',
  authGuard,
  param('id').isInt(),
  body('userId').isInt(),
  validationProblem,
  async (req, res) => {
    const conversationId = Number(req.params.id);
    const targetUserId = Number(req.body.userId);
    const membership = await ensureMembership(conversationId, req.auth.id);
    if (!membership || membership.role !== 'owner') {
      return res.status(403).json({ message: 'Only the conversation owner can manage administrators' });
    }
    const targetMembership = await ensureMembership(conversationId, targetUserId);
    if (!targetMembership) {
      return res.status(404).json({ message: 'User is not a member of this conversation' });
    }
    if (targetMembership.role === 'owner') {
      return res.status(400).json({ message: 'Owner privileges cannot be reassigned' });
    }
    const requestedPermissions = normalizePermissionShape(req.body.permissions, DEFAULT_ADMIN_PERMISSIONS);
    await pool.query(
      'UPDATE conversation_members SET role = ?, permissions = ? WHERE conversation_id = ? AND user_id = ?',
      ['admin', serializePermissionsForStore(requestedPermissions), conversationId, targetUserId]
    );
    const members = await fetchConversationMembers(conversationId);
    await emitConversationUpdate(conversationId, members.map((m) => m.id));
    io.to(`conversation:${conversationId}`).emit('conversation:members', { conversationId, members });
    return res.json({ members });
  }
);
app.put(
  '/api/conversations/:id/admins/:userId',
  authGuard,
  param('id').isInt(),
  param('userId').isInt(),
  validationProblem,
  async (req, res) => {
    const conversationId = Number(req.params.id);
    const targetUserId = Number(req.params.userId);
    const membership = await ensureMembership(conversationId, req.auth.id);
    if (!membership || membership.role !== 'owner') {
      return res.status(403).json({ message: 'Only the conversation owner can manage administrators' });
    }
    const targetMembership = await ensureMembership(conversationId, targetUserId);
    if (!targetMembership || targetMembership.role !== 'admin') {
      return res.status(404).json({ message: 'Administrator not found' });
    }
    const permissions = normalizePermissionShape(req.body.permissions, DEFAULT_ADMIN_PERMISSIONS);
    await pool.query(
      'UPDATE conversation_members SET permissions = ? WHERE conversation_id = ? AND user_id = ?',
      [serializePermissionsForStore(permissions), conversationId, targetUserId]
    );
    const members = await fetchConversationMembers(conversationId);
    await emitConversationUpdate(conversationId, members.map((m) => m.id));
    io.to(`conversation:${conversationId}`).emit('conversation:members', { conversationId, members });
    return res.json({ members });
  }
);
app.delete(
  '/api/conversations/:id/admins/:userId',
  authGuard,
  param('id').isInt(),
  param('userId').isInt(),
  validationProblem,
  async (req, res) => {
    const conversationId = Number(req.params.id);
    const targetUserId = Number(req.params.userId);
    const membership = await ensureMembership(conversationId, req.auth.id);
    if (!membership || membership.role !== 'owner') {
      return res.status(403).json({ message: 'Only the conversation owner can manage administrators' });
    }
    const targetMembership = await ensureMembership(conversationId, targetUserId);
    if (!targetMembership) {
      return res.status(404).json({ message: 'User is not a member of this conversation' });
    }
    if (targetMembership.role === 'owner') {
      return res.status(400).json({ message: 'Owner privileges cannot be reassigned' });
    }
    await pool.query(
      'UPDATE conversation_members SET role = ?, permissions = JSON_OBJECT() WHERE conversation_id = ? AND user_id = ?',
      ['member', conversationId, targetUserId]
    );
    const members = await fetchConversationMembers(conversationId);
    await emitConversationUpdate(conversationId, members.map((m) => m.id));
    io.to(`conversation:${conversationId}`).emit('conversation:members', { conversationId, members });
    return res.json({ members });
  }
);
app.get(
  '/api/conversations/:id/messages',
  authGuard,
  param('id').isInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }),
  query('before').optional().isInt({ min: 1 }),
  validationProblem,
  async (req, res) => {
    const conversationId = Number(req.params.id);
    const membership = await ensureMembership(conversationId, req.auth.id);
    if (!membership) {
      return res.status(403).json({ message: '������ ��������' });
    }
    const messages = await fetchMessages(conversationId, req.auth.id, {
      limit: req.query.limit,
      before: req.query.before
    });
    return res.json({ messages });
  }
);
app.post('/api/conversations/:id/read', authGuard, param('id').isInt(), validationProblem, async (req, res) => {
  const conversationId = Number(req.params.id);
  const membership = await ensureMembership(conversationId, req.auth.id);
  if (!membership) {
    return res.status(403).json({ message: '������ ��������' });
  }
  await markConversationRead(conversationId, req.auth.id);
  await emitConversationUpdate(conversationId, [req.auth.id]);
  return res.json({ ok: true });
});
app.get('/api/messages/:id/reactions', authGuard, async (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    const [reactions] = await pool.query(
      `SELECT mr.id, mr.emoji, mr.user_id, mr.created_at, u.username
       FROM message_reactions mr
       JOIN users u ON u.id = mr.user_id
       WHERE mr.message_id = ?
       ORDER BY mr.created_at ASC`,
      [messageId]
    );
    return res.json({ reactions });
  } catch (error) {
    console.error('Failed to get reactions:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
app.post('/api/messages/:id/reactions', authGuard, body('emoji').isLength({ min: 1, max: 10 }), validationProblem, async (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    const userId = req.auth.id;
    const emoji = req.body.emoji;
    const [existing] = await pool.query(
      `SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?`,
      [messageId, userId, emoji]
    );
    if (existing.length > 0) {
      await pool.query(`DELETE FROM message_reactions WHERE id = ?`, [existing[0].id]);
    } else {
      await pool.query(
        `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)`,
        [messageId, userId, emoji]
      );
    }
    const [reactions] = await pool.query(
      `SELECT mr.id, mr.emoji, mr.user_id, mr.created_at, u.username
       FROM message_reactions mr
       JOIN users u ON u.id = mr.user_id
       WHERE mr.message_id = ?
       ORDER BY mr.created_at ASC`,
      [messageId]
    );
    const [msgRows] = await pool.query(`SELECT conversation_id FROM messages WHERE id = ?`, [messageId]);
    if (msgRows.length > 0) {
      io.to(`conversation:${msgRows[0].conversation_id}`).emit('message:reactions', { messageId, reactions });
    }
    return res.json({ reactions });
  } catch (error) {
    console.error('Failed to toggle reaction:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
app.get('/api/conversations/:id/pinned', authGuard, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id);
    const membership = await ensureMembership(conversationId, req.auth.id);
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const [pinned] = await pool.query(
      `SELECT m.id, m.content, m.created_at, u.username as sender_name, pm.pinned_at
       FROM pinned_messages pm
       JOIN messages m ON m.id = pm.message_id
       JOIN users u ON u.id = m.user_id
       WHERE pm.conversation_id = ?
       ORDER BY pm.pinned_at DESC`,
      [conversationId]
    );
    return res.json({ pinned });
  } catch (error) {
    console.error('Failed to get pinned messages:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
app.post('/api/conversations/:id/pinned', authGuard, body('messageId').isInt(), validationProblem, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id);
    const messageId = parseInt(req.body.messageId);
    const membership = await ensureMembership(conversationId, req.auth.id);
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const [existing] = await pool.query(
      `SELECT id FROM pinned_messages WHERE conversation_id = ? AND message_id = ?`,
      [conversationId, messageId]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Message already pinned' });
    }
    const [count] = await pool.query(
      `SELECT COUNT(*) as total FROM pinned_messages WHERE conversation_id = ?`,
      [conversationId]
    );
    if (count[0].total >= MAX_PINNED_MESSAGES) {
      return res.status(400).json({ message: `Maximum ${MAX_PINNED_MESSAGES} pinned messages allowed` });
    }
    await pool.query(
      `INSERT INTO pinned_messages (conversation_id, message_id, pinned_by) VALUES (?, ?, ?)`,
      [conversationId, messageId, req.auth.id]
    );
    io.to(`conversation:${conversationId}`).emit('message:pinned', { conversationId, messageId });
    return res.json({ message: 'Message pinned successfully' });
  } catch (error) {
    console.error('Failed to pin message:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
app.delete('/api/conversations/:id/pinned/:messageId', authGuard, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id);
    const messageId = parseInt(req.params.messageId);
    const membership = await ensureMembership(conversationId, req.auth.id);
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }
    await pool.query(
      `DELETE FROM pinned_messages WHERE conversation_id = ? AND message_id = ?`,
      [conversationId, messageId]
    );
    io.to(`conversation:${conversationId}`).emit('message:unpinned', { conversationId, messageId });
    return res.json({ message: 'Message unpinned successfully' });
  } catch (error) {
    console.error('Failed to unpin message:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
app.put('/api/messages/:id', authGuard, body('content').isString().trim().isLength({ min: 1 }), validationProblem, async (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    const newContent = req.body.content;
    const [messages] = await pool.query(
      `SELECT id, user_id, conversation_id, created_at FROM messages WHERE id = ?`,
      [messageId]
    );
    if (!messages.length) {
      return res.status(404).json({ message: 'Message not found' });
    }
    const message = messages[0];
    if (message.user_id !== req.auth.id) {
      return res.status(403).json({ message: 'You can only edit your own messages' });
    }
    const messageTime = new Date(message.created_at).getTime();
    const now = Date.now();
    const hoursSinceCreated = (now - messageTime) / (1000 * 60 * 60);
    if (hoursSinceCreated > 24) {
      return res.status(400).json({ message: 'Cannot edit messages older than 24 hours' });
    }
    await pool.query(
      `UPDATE messages SET content = ?, edited_at = NOW() WHERE id = ?`,
      [newContent, messageId]
    );
    io.to(`conversation:${message.conversation_id}`).emit('message:edited', {
      messageId,
      content: newContent,
      editedAt: new Date()
    });
    return res.json({ message: 'Message updated successfully' });
  } catch (error) {
    console.error('Failed to edit message:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
app.delete('/api/messages/:id', authGuard, async (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    const [messages] = await pool.query(
      `SELECT id, user_id, conversation_id FROM messages WHERE id = ?`,
      [messageId]
    );
    if (!messages.length) {
      return res.status(404).json({ message: 'Message not found' });
    }
    const message = messages[0];
    if (message.user_id !== req.auth.id) {
      return res.status(403).json({ message: 'You can only delete your own messages' });
    }
    await pool.query(`DELETE FROM messages WHERE id = ?`, [messageId]);
    io.to(`conversation:${message.conversation_id}`).emit('message:deleted', { messageId });
    return res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Failed to delete message:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
app.get('/api/conversations/:id/background', authGuard, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id);
    const membership = await ensureMembership(conversationId, req.auth.id);
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const [rows] = await pool.query(
      `SELECT background FROM conversation_user_settings WHERE conversation_id = ? AND user_id = ?`,
      [conversationId, req.auth.id]
    );
    const background = rows[0]?.background ? JSON.parse(rows[0].background) : null;
    return res.json({ background });
  } catch (error) {
    console.error('Failed to get background:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
app.post('/api/conversations/:id/background', authGuard, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id);
    const membership = await ensureMembership(conversationId, req.auth.id);
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const background = req.body.background ? JSON.stringify(req.body.background) : null;
    await pool.query(
      `INSERT INTO conversation_user_settings (conversation_id, user_id, background)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE background = ?`,
      [conversationId, req.auth.id, background, background]
    );
    return res.json({ message: 'Background saved successfully' });
  } catch (error) {
    console.error('Failed to save background:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
app.get('/api/conversations/:id/search', authGuard, query('q').isString().trim().isLength({ min: 1 }), validationProblem, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id);
    const searchQuery = req.query.q;
    const membership = await ensureMembership(conversationId, req.auth.id);
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const [results] = await pool.query(
      `SELECT m.id, m.content, m.created_at, u.username as sender_name
       FROM messages m
       JOIN users u ON u.id = m.user_id
       WHERE m.conversation_id = ? AND m.content LIKE ?
       ORDER BY m.created_at DESC
       LIMIT 50`,
      [conversationId, `%${searchQuery}%`]
    );
    return res.json({ results });
  } catch (error) {
    console.error('Failed to search conversation:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
app.get('/api/users/:id/gallery', authGuard, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const user = await findUserById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const [photos] = await pool.query(
      `SELECT id, url, caption, position, created_at
       FROM user_gallery
       WHERE user_id = ?
       ORDER BY position ASC, created_at DESC`,
      [userId]
    );
    return res.json({ photos });
  } catch (error) {
    console.error('Failed to get user gallery:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
app.post('/api/users/gallery', authGuard, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No photo provided' });
    }
    const userId = req.auth.id;
    const caption = req.body.caption || null;
    const [existing] = await pool.query(
      `SELECT COUNT(*) as count FROM user_gallery WHERE user_id = ?`,
      [userId]
    );
    if (existing[0].count >= 12) {
      return res.status(400).json({ message: 'Gallery limit reached (max 12 photos)' });
    }
    const photoUrl = `/uploads/${req.file.filename}`;
    const [result] = await pool.query(
      `INSERT INTO user_gallery (user_id, url, caption) VALUES (?, ?, ?)`,
      [userId, photoUrl, caption]
    );
    const photo = {
      id: result.insertId,
      url: photoUrl,
      caption,
      position: existing[0].count + 1,
      created_at: new Date()
    };
    return res.status(201).json({ photo });
  } catch (error) {
    console.error('Failed to upload gallery photo:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
app.delete('/api/users/gallery/:photoId', authGuard, async (req, res) => {
  try {
    const photoId = parseInt(req.params.photoId);
    const userId = req.auth.id;
    const [photos] = await pool.query(
      `SELECT id, user_id, url FROM user_gallery WHERE id = ?`,
      [photoId]
    );
    if (!photos.length) {
      return res.status(404).json({ message: 'Photo not found' });
    }
    const photo = photos[0];
    if (photo.user_id !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    await pool.query(`DELETE FROM user_gallery WHERE id = ?`, [photoId]);
    return res.json({ message: 'Photo deleted successfully' });
  } catch (error) {
    console.error('Failed to delete gallery photo:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
app.post(
  '/api/conversations/:id/messages',
  authGuard,
  param('id').isInt(),
  validationProblem,
  async (req, res) => {
    const conversationId = Number(req.params.id);
    const membership = await ensureMembership(conversationId, req.auth.id);
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    const attachmentIds = Array.isArray(req.body.attachments) ? req.body.attachments : [];
    const parentId = req.body.parentId ? Number(req.body.parentId) : null;
    if (content && content.length > 4000) {
      return res.status(400).json({ message: 'Message content too long (max 4000 characters)' });
    }
    if (!content && attachmentIds.length === 0) {
      return res.status(400).json({ message: 'Message must contain text or attachments' });
    }
    const attachments = await attachFiles(req.auth.id, attachmentIds);
    let replySnapshot = null;
    if (parentId) {
      const [parentRows] = await pool.query(
        `SELECT m.id, m.conversation_id, m.content, m.attachments, u.id AS user_id, u.display_name, u.username, u.public_id
         FROM messages m
         JOIN users u ON u.id = m.user_id
         WHERE m.id = ?
         LIMIT 1`,
        [parentId]
      );
      if (!parentRows.length || parentRows[0].conversation_id !== conversationId) {
        return res.status(400).json({ message: 'Reply target does not belong to this conversation' });
      }
      const parent = parentRows[0];
      const attachmentsList = safeJsonParse(parent.attachments, []);
      replySnapshot = {
        id: parent.id,
        content: parent.content,
        attachments: Array.isArray(attachmentsList)
          ? attachmentsList.map((raw) => normalizeAttachment(raw)).filter(Boolean)
          : [],
        user: {
          id: parent.user_id,
          displayName: parent.display_name,
          username: parent.username,
          publicId: parent.public_id
        }
      };
    }
    const [result] = await pool.query(
      'INSERT INTO messages (conversation_id, user_id, content, attachments, parent_id, reply_snapshot) VALUES (?, ?, ?, ?, ?, ?)',
      [
        conversationId,
        req.auth.id,
        content || null,
        attachments.length ? JSON.stringify(attachments) : null,
        parentId || null,
        replySnapshot ? JSON.stringify(replySnapshot) : null
      ]
    );
    const message = await fetchMessageById(result.insertId, req.auth.id);
    await updateConversationTimestamp(conversationId);
    await emitConversationUpdate(conversationId);
    io.to(`conversation:${conversationId}`).emit('message:created', message);
    return res.status(201).json({ message });
  }
);
app.put(
  '/api/messages/:id',
  authGuard,
  param('id').isInt(),
  body('content').isLength({ min: 1, max: 4000 }),
  validationProblem,
  async (req, res) => {
    const messageId = Number(req.params.id);
    const content = req.body.content.trim();
    const [rows] = await pool.query('SELECT conversation_id, user_id FROM messages WHERE id = ? LIMIT 1', [messageId]);
    if (!rows.length) {
      return res.status(404).json({ message: 'Message not found' });
    }
    const messageRow = rows[0];
    if (messageRow.user_id !== req.auth.id) {
      const membership = await ensureMembership(messageRow.conversation_id, req.auth.id);
      if (!membership || !hasPermission(membership, 'moderateMessages')) {
        return res.status(403).json({ message: 'Only moderators can edit messages from other users' });
      }
    }
    await pool.query('UPDATE messages SET content = ?, is_edited = 1, edited_at = CURRENT_TIMESTAMP WHERE id = ?', [content, messageId]);
    const message = await fetchMessageById(messageId, req.auth.id);
    io.to(`conversation:${messageRow.conversation_id}`).emit('message:updated', message);
    return res.json({ message });
  }
);
app.delete(
  '/api/messages/:id',
  authGuard,
  param('id').isInt(),
  validationProblem,
  async (req, res) => {
    const messageId = Number(req.params.id);
    const [rows] = await pool.query('SELECT conversation_id, user_id FROM messages WHERE id = ? LIMIT 1', [messageId]);
    if (!rows.length) {
      return res.status(404).json({ message: 'Message not found' });
    }
    const messageRow = rows[0];
    if (messageRow.user_id !== req.auth.id) {
      const membership = await ensureMembership(messageRow.conversation_id, req.auth.id);
      if (!membership || !hasPermission(membership, 'moderateMessages')) {
        return res.status(403).json({ message: 'Only moderators can delete messages from other users' });
      }
    }
    await pool.query('UPDATE messages SET content = NULL, deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [messageId]);
    const message = await fetchMessageById(messageId, req.auth.id);
    io.to(`conversation:${messageRow.conversation_id}`).emit('message:deleted', message);
    return res.json({ message });
  }
);
app.post(
  '/api/messages/:id/reactions',
  authGuard,
  param('id').isInt(),
  body('emoji').isLength({ min: 1, max: 16 }),
  body('action').isIn(['add', 'remove']),
  validationProblem,
  async (req, res) => {
    const messageId = Number(req.params.id);
    const emoji = String(req.body.emoji);
    const action = req.body.action;
    const [rows] = await pool.query('SELECT conversation_id FROM messages WHERE id = ? LIMIT 1', [messageId]);
    if (!rows.length) {
      return res.status(404).json({ message: '��������� �� �������' });
    }
    const conversationId = rows[0].conversation_id;
    const membership = await ensureMembership(conversationId, req.auth.id);
    if (!membership) {
      return res.status(403).json({ message: '������ ��������' });
    }
    if (action === 'add') {
      await pool.query(
        'REPLACE INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)',
        [messageId, req.auth.id, emoji]
      );
    } else {
      await pool.query(
        'DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
        [messageId, req.auth.id, emoji]
      );
    }
    const message = await fetchMessageById(messageId, req.auth.id);
    io.to(`conversation:${conversationId}`).emit('message:updated', message);
    return res.json({ message });
  }
);
app.post(
  '/api/messages/:id/favorite',
  authGuard,
  param('id').isInt(),
  validationProblem,
  async (req, res) => {
    const messageId = Number(req.params.id);
    const [rows] = await pool.query('SELECT conversation_id, user_id FROM messages WHERE id = ? LIMIT 1', [messageId]);
    if (!rows.length) {
      return res.status(404).json({ message: '��������� �� �������' });
    }
    const messageRow = rows[0];
    if (messageRow.user_id !== req.auth.id) {
      const membership = await ensureMembership(messageRow.conversation_id, req.auth.id);
      if (!hasPermission(membership, 'moderateMessages')) {
        return res.status(403).json({ message: '������� ����� ⮫쪮 ᢮� ᮮ�饭��' });
      }
    }
    await pool.query('INSERT IGNORE INTO message_favorites (user_id, message_id) VALUES (?, ?)', [req.auth.id, messageId]);
    const message = await fetchMessageById(messageId, req.auth.id);
    return res.status(201).json({ message });
  }
);
app.delete(
  '/api/messages/:id/favorite',
  authGuard,
  param('id').isInt(),
  validationProblem,
  async (req, res) => {
    const messageId = Number(req.params.id);
    const [rows] = await pool.query('SELECT user_id FROM messages WHERE id = ? LIMIT 1', [messageId]);
    if (!rows.length) {
      return res.status(404).json({ message: '��������� �� �������' });
    }
    if (rows[0].user_id !== req.auth.id) {
      return res.status(403).json({ message: '����� ������� �� ���������� ������ ���� ���������' });
    }
    await pool.query('DELETE FROM message_favorites WHERE user_id = ? AND message_id = ?', [req.auth.id, messageId]);
    return res.json({ ok: true });
  }
);
app.get(
  '/api/favorites',
  authGuard,
  query('conversationId').optional().isInt({ min: 1 }),
  validationProblem,
  async (req, res) => {
    const conversationId = req.query.conversationId ? Number(req.query.conversationId) : null;
    const favorites = await fetchFavoriteMessages(req.auth.id);
    const filtered = conversationId ? favorites.filter((message) => message.conversationId === conversationId) : favorites;
    return res.json({ favorites: filtered });
  }
);
app.get(
  '/api/conversations/:id/pins',
  authGuard,
  param('id').isInt(),
  validationProblem,
  async (req, res) => {
    const conversationId = Number(req.params.id);
    const membership = await ensureMembership(conversationId, req.auth.id);
    if (!membership) {
      return res.status(403).json({ message: '������ ��������' });
    }
    const pins = await fetchPinnedMessages(conversationId, req.auth.id);
    return res.json({ pins });
  }
);
app.post(
  '/api/messages/:id/pin',
  authGuard,
  param('id').isInt(),
  validationProblem,
  async (req, res) => {
    const messageId = Number(req.params.id);
    const [rows] = await pool.query('SELECT conversation_id FROM messages WHERE id = ? LIMIT 1', [messageId]);
    if (!rows.length) {
      return res.status(404).json({ message: '��������� �� �������' });
    }
    const conversationId = rows[0].conversation_id;
    const membership = await ensureMembership(conversationId, req.auth.id);
    if (!membership) {
      return res.status(403).json({ message: '������ ��������' });
    }
    if (!hasPermission(membership, 'moderateMessages')) {
      return res.status(403).json({ message: '������ �������������� ����� ���������� ���������' });
    }
    await pool.query(
      'INSERT IGNORE INTO conversation_pins (conversation_id, message_id, pinned_by) VALUES (?, ?, ?)',
      [conversationId, messageId, req.auth.id]
    );
    const [pinRows] = await pool.query(
      'SELECT id FROM conversation_pins WHERE conversation_id = ? ORDER BY pinned_at DESC',
      [conversationId]
    );
    if (pinRows.length > MAX_PINNED_MESSAGES) {
      const excess = pinRows.slice(MAX_PINNED_MESSAGES);
      const excessIds = excess.map((row) => row.id);
      await pool.query('DELETE FROM conversation_pins WHERE id IN (?)', [excessIds]);
    }
    await broadcastPinnedMessages(conversationId);
    const pins = await fetchPinnedMessages(conversationId, req.auth.id);
    return res.status(201).json({ pins });
  }
);
app.delete(
  '/api/messages/:id/pin',
  authGuard,
  param('id').isInt(),
  validationProblem,
  async (req, res) => {
    const messageId = Number(req.params.id);
    const [rows] = await pool.query('SELECT conversation_id FROM messages WHERE id = ? LIMIT 1', [messageId]);
    if (!rows.length) {
      return res.status(404).json({ message: '��������� �� �������' });
    }
    const conversationId = rows[0].conversation_id;
    const membership = await ensureMembership(conversationId, req.auth.id);
    if (!membership) {
      return res.status(403).json({ message: '������ ��������' });
    }
    if (!hasPermission(membership, 'moderateMessages')) {
      return res.status(403).json({ message: '������ �������������� ����� ������� �������' });
    }
    await pool.query('DELETE FROM conversation_pins WHERE conversation_id = ? AND message_id = ?', [conversationId, messageId]);
    await broadcastPinnedMessages(conversationId);
    const pins = await fetchPinnedMessages(conversationId, req.auth.id);
    return res.json({ pins });
  }
);
app.post(
  '/api/messages/:id/forward',
  authGuard,
  param('id').isInt(),
  body('conversationId').optional().isInt({ min: 1 }),
  body('username').optional().isString().isLength({ min: 3, max: 64 }),
  body('content').optional().isLength({ max: 4000 }),
  validationProblem,
  async (req, res) => {
    const messageId = Number(req.params.id);
    const targetConversationIdRaw = req.body.conversationId ? Number(req.body.conversationId) : null;
    const rawIdentifier = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    if (!targetConversationIdRaw && !rawIdentifier) {
      return res.status(400).json({ message: '������� ������ ��� ����������� ��� ���������' });
    }
    const original = await fetchMessageById(messageId, req.auth.id);
    if (!original) {
      return res.status(404).json({ message: '��������� �� �������' });
    }
    const membership = await ensureMembership(original.conversationId, req.auth.id);
    if (!membership) {
      return res.status(403).json({ message: '������ ��������' });
    }
    let targetConversationId = targetConversationIdRaw;
    let conversationPayload = null;
    if (rawIdentifier) {
      let user = await findUserByUsername(rawIdentifier.toLowerCase());
      if (!user && rawIdentifier.length >= 4) {
        user = await findUserByPublicId(rawIdentifier.toUpperCase());
      }
      if (!user) {
        return res.status(404).json({ message: '������������ �� ������' });
      }
      if (user.id === req.auth.id) {
        return res.status(400).json({ message: '������ ��������� ��������� ������ ����' });
      }
      const directResult = await ensureDirectConversationBetween(req.auth.id, user);
      targetConversationId = directResult.conversationId;
      conversationPayload = directResult.payload;
    }
    if (!targetConversationId) {
      return res.status(400).json({ message: '������ ��� ��������� �� �������' });
    }
    const targetMembership = await ensureMembership(targetConversationId, req.auth.id);
    if (!targetMembership) {
      return res.status(403).json({ message: '�� �� �������� � ��������� ������' });
    }
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    const attachmentsData = original.attachments?.length ? JSON.stringify(original.attachments) : null;
    const forwardMetadata = {
      messageId: original.id,
      conversationId: original.conversationId,
      user: original.user
        ? {
            id: original.user.id,
            displayName: original.user.displayName,
            username: original.user.username,
            publicId: original.user.publicId,
            avatarUrl: original.user.avatarUrl,
            avatarColor: original.user.avatarColor
          }
        : null,
      createdAt: original.createdAt
    };
    const [result] = await pool.query(
      'INSERT INTO messages (conversation_id, user_id, content, attachments, forwarded_from_message_id, forward_metadata) VALUES (?, ?, ?, ?, ?, ?)',
      [
        targetConversationId,
        req.auth.id,
        content || null,
        attachmentsData,
        original.id,
        JSON.stringify(forwardMetadata)
      ]
    );
    const message = await fetchMessageById(result.insertId, req.auth.id);
    await updateConversationTimestamp(targetConversationId);
    await emitConversationUpdate(targetConversationId);
    io.to(`conversation:${targetConversationId}`).emit('message:created', message);
    return res.status(201).json({
      message,
      conversationId: targetConversationId,
      conversation: conversationPayload
    });
  }
);
app.get('/api/folders', authGuard, async (req, res) => {
  const folders = await fetchFolders(req.auth.id);
  return res.json({ folders });
});
app.post(
  '/api/folders',
  authGuard,
  body('title').isLength({ min: 2, max: 60 }),
  body('color').optional().isString(),
  validationProblem,
  async (req, res) => {
    const title = req.body.title.trim();
    const color = req.body.color && isValidHexColor(req.body.color) ? req.body.color.trim() : null;
    const [result] = await pool.query(
      'INSERT INTO conversation_folders (user_id, title, color) VALUES (?, ?, ?)',
      [req.auth.id, title, color]
    );
    await emitFoldersUpdate(req.auth.id);
    const folders = await fetchFolders(req.auth.id);
    const folder = folders.find((item) => item.id === result.insertId) || null;
    return res.status(201).json({ folder, folders });
  }
);
app.put(
  '/api/folders/:id',
  authGuard,
  param('id').isInt(),
  body('title').optional().isLength({ min: 2, max: 60 }),
  body('color').optional().isString(),
  validationProblem,
  async (req, res) => {
    const folderId = Number(req.params.id);
    const [rows] = await pool.query('SELECT user_id FROM conversation_folders WHERE id = ? LIMIT 1', [folderId]);
    if (!rows.length || rows[0].user_id !== req.auth.id) {
      return res.status(404).json({ message: '����� �� �������' });
    }
    const fields = [];
    const params = [];
    if (typeof req.body.title === 'string') {
      const title = req.body.title.trim();
      if (!title) {
        return res.status(400).json({ message: '�������� ����� �� ����� ���� ������' });
      }
      fields.push('title = ?');
      params.push(title);
    }
    if (req.body.color !== undefined) {
      const color = req.body.color && isValidHexColor(req.body.color) ? req.body.color.trim() : null;
      fields.push('color = ?');
      params.push(color);
    }
    if (!fields.length) {
      return res.status(400).json({ message: '��� ��������� ��� ����������' });
    }
    params.push(folderId);
    await pool.query(`UPDATE conversation_folders SET ${fields.join(', ')} WHERE id = ?`, params);
    await emitFoldersUpdate(req.auth.id);
    const folders = await fetchFolders(req.auth.id);
    const folder = folders.find((item) => item.id === folderId) || null;
    return res.json({ folder, folders });
  }
);
app.delete(
  '/api/folders/:id',
  authGuard,
  param('id').isInt(),
  validationProblem,
  async (req, res) => {
    const folderId = Number(req.params.id);
    const [rows] = await pool.query('SELECT user_id FROM conversation_folders WHERE id = ? LIMIT 1', [folderId]);
    if (!rows.length || rows[0].user_id !== req.auth.id) {
      return res.status(404).json({ message: '����� �� �������' });
    }
    await pool.query('DELETE FROM conversation_folders WHERE id = ?', [folderId]);
    await emitFoldersUpdate(req.auth.id);
    return res.status(204).send();
  }
);
app.post(
  '/api/folders/:id/conversations',
  authGuard,
  param('id').isInt(),
  body('conversationId').isInt(),
  validationProblem,
  async (req, res) => {
    const folderId = Number(req.params.id);
    const conversationId = Number(req.body.conversationId);
    const [rows] = await pool.query('SELECT user_id FROM conversation_folders WHERE id = ? LIMIT 1', [folderId]);
    if (!rows.length || rows[0].user_id !== req.auth.id) {
      return res.status(404).json({ message: '����� �� �������' });
    }
    const membership = await ensureMembership(conversationId, req.auth.id);
    if (!membership) {
      return res.status(403).json({ message: '�� �� �������� � ���� ������' });
    }
    const position = Math.floor(Date.now() / 1000);
    await pool.query(
      `INSERT INTO conversation_folder_items (folder_id, conversation_id, position)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE position = VALUES(position)`,
      [folderId, conversationId, position]
    );
    await emitFoldersUpdate(req.auth.id);
    const folders = await fetchFolders(req.auth.id);
    return res.status(201).json({ folders });
  }
);
app.delete(
  '/api/folders/:id/conversations/:conversationId',
  authGuard,
  param('id').isInt(),
  param('conversationId').isInt(),
  validationProblem,
  async (req, res) => {
    const folderId = Number(req.params.id);
    const conversationId = Number(req.params.conversationId);
    const [rows] = await pool.query('SELECT user_id FROM conversation_folders WHERE id = ? LIMIT 1', [folderId]);
    if (!rows.length || rows[0].user_id !== req.auth.id) {
      return res.status(404).json({ message: '����� �� �������' });
    }
    await pool.query('DELETE FROM conversation_folder_items WHERE folder_id = ? AND conversation_id = ?', [folderId, conversationId]);
    await emitFoldersUpdate(req.auth.id);
    const folders = await fetchFolders(req.auth.id);
    return res.json({ folders });
  }
);
app.post('/api/uploads', authGuard, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: '���� �� �������' });
  }
  try {
    const id = uuid();
    const kind = detectAttachmentKind(req.file.mimetype);
    const isCircle = String(req.body?.circle || '').toLowerCase() === 'true';
  const rawDuration = req.body?.duration !== undefined ? Number(req.body.duration) : null;
  const duration = Number.isFinite(rawDuration) && rawDuration >= 0 ? Math.round(rawDuration) : null;
    const waveform = req.body?.waveform ? tryStringifyWaveform(req.body.waveform) : null;
    const fileType = req.body?.type || null;
    await pool.query(
      'INSERT INTO attachments (id, user_id, file_name, stored_name, mime_type, size, kind, is_circle, duration_ms, waveform, file_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, req.auth.id, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, kind, isCircle ? 1 : 0, duration, waveform, fileType]
    );
    return res.status(201).json({ attachment: mapAttachment({
      id,
      file_name: req.file.originalname,
      stored_name: req.file.filename,
      mime_type: req.file.mimetype,
      size: req.file.size,
      kind,
      is_circle: isCircle ? 1 : 0,
      duration_ms: duration,
      waveform,
      file_type: fileType
    }) });
  } catch (error) {
    console.error('Upload error', error);
    return res.status(500).json({ message: '�� ������� ��������� ����' });
  }
});
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
  }
  return next();
});
const userSockets = new Map();
const activeCalls = new Map(); // conversationId -> Map<userId, { sockets: Set<string>, user: object, muted: boolean, screenSharing: boolean }>

// Админ-панель - API маршруты (после определения userSockets)
const adminRoutes = require(path.join(process.cwd(), 'admin', 'api', 'routes.js'))(pool, io, userSockets, authGuard);
app.use('/api/admin', adminRoutes);

function getCallState(conversationId) {
  if (!activeCalls.has(conversationId)) {
    activeCalls.set(conversationId, new Map());
  }
  return activeCalls.get(conversationId);
}
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Missing token'));
    }
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await findUserById(payload.id);
    if (!user) {
      return next(new Error('User not found'));
    }
    socket.data.user = mapUser(user);
    return next();
  } catch (error) {
    return next(new Error('Unauthorized'));
  }
});
io.on('connection', async (socket) => {
  const user = socket.data.user;
  if (!user) {
    socket.disconnect();
    return;
  }
  socket.data.activeCalls = new Set();
  let sockets = userSockets.get(user.id);
  if (!sockets) {
    sockets = new Set();
    socket.data.conversations?.delete(conversationId);
  }
  sockets.add(socket);
  if (sockets.size === 1) {
    io.emit('presence:update', { userId: user.id, status: 'online' });
  }
  const [conversationRows] = await pool.query(
    'SELECT conversation_id FROM conversation_members WHERE user_id = ?',
    [user.id]
  );
  const conversationIds = conversationRows.map((row) => row.conversation_id);
  socket.data.conversations = new Set(conversationIds);
  conversationIds.forEach((conversationId) => socket.join(`conversation:${conversationId}`));
  socket.emit('conversation:list', await fetchConversationList(user.id));
  socket.on('conversation:read', async ({ conversationId }) => {
    if (!socket.data.conversations.has(conversationId)) return;
    await markConversationRead(conversationId, user.id);
    await emitConversationUpdate(conversationId, [user.id]);
  });
  socket.on('typing:start', async ({ conversationId }) => {
    if (!socket.data.conversations.has(conversationId)) return;
    socket.to(`conversation:${conversationId}`).emit('typing:update', { conversationId, userId: user.id, isTyping: true });
  });
  socket.on('typing:stop', async ({ conversationId }) => {
    if (!socket.data.conversations.has(conversationId)) return;
    socket.to(`conversation:${conversationId}`).emit('typing:update', { conversationId, userId: user.id, isTyping: false });
  });
  socket.on('message:create', async (payload, ack) => {
    try {
      const conversationId = Number(payload?.conversationId);
      const content = typeof payload?.content === 'string' ? payload.content.trim() : '';
      const attachmentIds = Array.isArray(payload?.attachments) ? payload.attachments : [];
      const replyToId = payload?.parentId ? Number(payload.parentId) : null;
      if (!conversationId || !socket.data.conversations.has(conversationId)) {
        throw new Error('Conversation not joined');
      }
      if (!content && !attachmentIds.length) {
        throw new Error('��������� �� ����� ���� ������');
      }
      const attachments = await attachFiles(user.id, attachmentIds);
      const [result] = await pool.query(
        'INSERT INTO messages (conversation_id, user_id, content, attachments, reply_to_id) VALUES (?, ?, ?, ?, ?)',
        [conversationId, user.id, content || null, attachments.length ? JSON.stringify(attachments) : null, replyToId]
      );
      console.log('[Socket] ✅ Message created with reply_to_id:', replyToId);
      const message = await fetchMessageById(result.insertId, user.id);
      await updateConversationTimestamp(conversationId);
      io.to(`conversation:${conversationId}`).emit('message:created', message);
      await emitConversationUpdate(conversationId);
      if (ack) ack({ ok: true, message });
    } catch (error) {
      console.error('Socket message error', error);
      if (ack) ack({ ok: false, message: error.message || '�� ������� ��������� ���������' });
    }
  });
  socket.on('message:update', async ({ messageId, content }, ack) => {
    try {
      const message = await fetchMessageById(messageId, user.id);
      if (!message) throw new Error('not-found');
      if (message.user.id !== user.id) throw new Error('forbidden');
      await pool.query('UPDATE messages SET content = ?, is_edited = 1, edited_at = CURRENT_TIMESTAMP WHERE id = ?', [content.trim(), messageId]);
      const updated = await fetchMessageById(messageId, user.id);
      io.to(`conversation:${updated.conversationId}`).emit('message:updated', updated);
      if (ack) ack({ ok: true, message: updated });
    } catch (error) {
      if (ack) ack({ ok: false });
    }
  });
  socket.on('message:delete', async ({ messageId }, ack) => {
    try {
      const message = await fetchMessageById(messageId, user.id);
      if (!message) throw new Error('not-found');
      if (message.user.id !== user.id) throw new Error('forbidden');
      await pool.query('UPDATE messages SET content = NULL, deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [messageId]);
      const updated = await fetchMessageById(messageId, user.id);
      io.to(`conversation:${updated.conversationId}`).emit('message:deleted', updated);
      if (ack) ack({ ok: true });
    } catch (error) {
      if (ack) ack({ ok: false });
    }
  });
  socket.on('message:reaction', async ({ messageId, emoji, action }, ack) => {
    try {
      const message = await fetchMessageById(messageId, user.id);
      if (!message) throw new Error('not-found');
      const conversationId = message.conversationId;
      if (!socket.data.conversations.has(conversationId)) throw new Error('forbidden');
      if (action === 'remove') {
    await pool.query('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?', [messageId, user.id, emoji]);
      } else {
    await pool.query('REPLACE INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)', [messageId, user.id, emoji]);
      }
      const updated = await fetchMessageById(messageId, user.id);
      io.to(`conversation:${conversationId}`).emit('message:updated', updated);
      if (ack) ack({ ok: true, message: updated });
    } catch (error) {
      if (ack) ack({ ok: false });
    }
  });
  socket.on('conversation:update', async ({ conversationId, title, description, isPrivate, avatarAttachmentId }, ack) => {
    try {
      const [members] = await pool.query(
        'SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
        [conversationId, user.id]
      );
      if (!members.length) throw new Error('forbidden');
      const userRole = members[0].role;
      if (userRole !== 'admin' && userRole !== 'owner') {
        throw new Error('only-admins');
      }
      const updates = [];
      const params = [];
      if (title !== undefined && title.trim()) {
        updates.push('title = ?');
        params.push(title.trim());
      }
      if (description !== undefined) {
        updates.push('description = ?');
        params.push(description.trim() || null);
      }
      if (isPrivate !== undefined) {
        updates.push('is_private = ?');
        params.push(isPrivate ? 1 : 0);
      }
      if (avatarAttachmentId !== undefined) {
        updates.push('avatar_attachment_id = ?');
        params.push(avatarAttachmentId || null);
        if (avatarAttachmentId) {
          const [attachments] = await pool.query('SELECT url FROM attachments WHERE id = ?', [avatarAttachmentId]);
          if (attachments.length) {
            updates.push('avatar_url = ?');
            params.push(attachments[0].url);
          }
        } else {
          updates.push('avatar_url = NULL');
        }
      }
      if (updates.length === 0) {
        throw new Error('no-updates');
      }
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(conversationId);
      await pool.query(
        `UPDATE conversations SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
      const [conversations] = await pool.query(
        'SELECT * FROM conversations WHERE id = ?',
        [conversationId]
      );
      if (!conversations.length) throw new Error('not-found');
      const conversation = conversations[0];
      const mapped = {
        id: conversation.id,
        title: conversation.title,
        description: conversation.description,
        isPrivate: !!conversation.is_private,
        avatarUrl: conversation.avatar_url,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at
      };
      io.to(`conversation:${conversationId}`).emit('conversation:updated', mapped);
      if (ack) ack({ ok: true, conversation: mapped });
    } catch (error) {
      console.error('Conversation update error', error);
      if (ack) ack({ ok: false, message: error.message || 'Не удалось обновить беседу' });
    }
  });
  socket.on('conversation:remove-member', async ({ conversationId, userId }, ack) => {
    try {
      const [requestorMembers] = await pool.query(
        'SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
        [conversationId, user.id]
      );
      if (!requestorMembers.length) throw new Error('forbidden');
      const requestorRole = requestorMembers[0].role;
      const [targetMembers] = await pool.query(
        'SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
        [conversationId, userId]
      );
      if (!targetMembers.length) throw new Error('user-not-member');
      const targetRole = targetMembers[0].role;
      if (requestorRole === 'member') {
        if (userId !== user.id) throw new Error('forbidden');
      } else if (requestorRole === 'admin') {
        if (targetRole === 'owner' || (targetRole === 'admin' && userId !== user.id)) {
          throw new Error('cannot-remove-admin');
        }
      }
      await pool.query(
        'DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
        [conversationId, userId]
      );
      io.to(`conversation:${conversationId}`).emit('conversation:member-removed', {
        conversationId,
        userId,
        removedBy: user.id
      });
      const targetSockets = await io.in(`user:${userId}`).fetchSockets();
      for (const targetSocket of targetSockets) {
        targetSocket.leave(`conversation:${conversationId}`);
        if (targetSocket.data.conversations) {
          targetSocket.data.conversations.delete(conversationId);
        }
      }
      if (ack) ack({ ok: true });
    } catch (error) {
      console.error('Remove member error', error);
      if (ack) ack({ ok: false, message: error.message || 'Не удалось удалить участника' });
    }
  });
  socket.on('conversation:change-role', async ({ conversationId, userId, role }, ack) => {
    try {
      const [requestorMembers] = await pool.query(
        'SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
        [conversationId, user.id]
      );
      if (!requestorMembers.length) throw new Error('forbidden');
      const requestorRole = requestorMembers[0].role;
      if (requestorRole !== 'owner') {
        throw new Error('only-owner');
      }
      const [targetMembers] = await pool.query(
        'SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
        [conversationId, userId]
      );
      if (!targetMembers.length) throw new Error('user-not-member');
      if (!['member', 'admin'].includes(role)) {
        throw new Error('invalid-role');
      }
      if (targetMembers[0].role === 'owner') {
        throw new Error('cannot-change-owner');
      }
      await pool.query(
        'UPDATE conversation_members SET role = ? WHERE conversation_id = ? AND user_id = ?',
        [role, conversationId, userId]
      );
      io.to(`conversation:${conversationId}`).emit('conversation:role-changed', {
        conversationId,
        userId,
        role,
        changedBy: user.id
      });
      if (ack) ack({ ok: true });
    } catch (error) {
      console.error('Change role error', error);
      if (ack) ack({ ok: false, message: error.message || 'Не удалось изменить роль' });
    }
  });
  socket.on('call:start', async ({ conversationId, hasVideo }) => {
    const callId = Number(conversationId);
    if (!callId || !socket.data.conversations.has(callId)) return;
    console.log(`[WebRTC] 📞 Call started by ${user.displayName} (${user.id}) in conversation ${callId}`);
    socket.to(`conversation:${callId}`).emit('call:incoming', {
      conversationId: callId,
      caller: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl || user.avatar,
        avatarColor: user.avatarColor || user.color
      },
      hasVideo: !!hasVideo,
      timestamp: Date.now()
    });
    console.log(`[WebRTC] ✅ call:incoming broadcast to conversation:${callId}`);
  });
  socket.on('call:join', ({ conversationId }) => {
    const callId = Number(conversationId);
    if (!callId || !socket.data.conversations.has(callId)) return;
    socket.join(`call:${callId}`);
    socket.data.activeCalls.add(callId);
    const callState = getCallState(callId);
    let entry = callState.get(user.id);
    if (!entry) {
      entry = {
        sockets: new Set(),
        user: { ...user },
        muted: false,
        screenSharing: false
      };
      callState.set(user.id, entry);
    } else {
      entry.user = { ...entry.user, ...user };
    }
    entry.sockets.add(socket.id);
    const participants = Array.from(callState.values()).map((participant) => ({
      user: participant.user,
      muted: participant.muted,
      screenSharing: participant.screenSharing
    }));
    socket.emit('call:participants', { conversationId: callId, participants });
    socket.to(`call:${callId}`).emit('call:user-joined', { conversationId: callId, user: entry.user });
  });
  socket.on('call:offer', ({ conversationId, offer, hasVideo }) => {
    console.log('[WebRTC] Offer from user', user.id, 'to conversation', conversationId);
    socket.to(`conversation:${conversationId}`).emit('call:offer', {
      conversationId,
      offer,
      hasVideo,
      callerId: user.id,
      callerName: user.username
    });
  });
  socket.on('call:answer', ({ conversationId, answer }) => {
    console.log('[WebRTC] Answer from user', user.id, 'to conversation', conversationId);
    socket.to(`conversation:${conversationId}`).emit('call:answer', {
      conversationId,
      answer,
      userId: user.id
    });
  });
  socket.on('call:ice-candidate', ({ conversationId, candidate }) => {
    console.log('[WebRTC] ICE candidate from user', user.id);
    socket.to(`conversation:${conversationId}`).emit('call:ice-candidate', {
      conversationId,
      candidate,
      userId: user.id
    });
  });
  socket.on('call:reject', ({ conversationId }) => {
    console.log('[WebRTC] Call rejected by user', user.id);
    socket.to(`conversation:${conversationId}`).emit('call:reject', {
      conversationId,
      userId: user.id
    });
  });
  socket.on('call:end', ({ conversationId }) => {
    console.log('[WebRTC] Call ended by user', user.id);
    socket.to(`conversation:${conversationId}`).emit('call:end', {
      conversationId,
      userId: user.id
    });
  });
  socket.on('call:signal', ({ conversationId, targetUserId, data }) => {
    const callId = Number(conversationId);
    const targetId = Number(targetUserId);
    if (!callId || !targetId || !socket.data.activeCalls.has(callId)) return;
    const callState = activeCalls.get(callId);
    const target = callState?.get(targetId);
    if (!target) return;
    target.sockets.forEach((socketId) => {
      io.to(socketId).emit('call:signal', {
        conversationId: callId,
        fromUserId: user.id,
        data
      });
    });
  });
  socket.on('call:state', ({ conversationId, muted, screenSharing }) => {
    const callId = Number(conversationId);
    if (!callId || !socket.data.activeCalls.has(callId)) return;
    const callState = activeCalls.get(callId);
    const entry = callState?.get(user.id);
    if (!entry) return;
    if (typeof muted === 'boolean') entry.muted = muted;
    if (typeof screenSharing === 'boolean') entry.screenSharing = screenSharing;
    socket.to(`call:${callId}`).emit('call:state', {
      conversationId: callId,
      userId: user.id,
      muted: entry.muted,
      screenSharing: entry.screenSharing
    });
  });
  socket.on('call:leave', ({ conversationId }) => {
    const callId = Number(conversationId);
    if (!callId || !socket.data.activeCalls.has(callId)) return;
    leaveCall(callId, socket);
  });
  socket.on('call:accept', ({ conversationId, timestamp }) => {
    console.log('[AudioRelay] Call accepted by user', user.id);
    socket.to(`conversation:${conversationId}`).emit('call:accept', {
      conversationId,
      userId: user.id,
      timestamp
    });
  });
  socket.on('call:audio', ({ conversationId, audio, timestamp }) => {
    socket.to(`conversation:${conversationId}`).emit('call:audio', {
      audio,
      timestamp,
      fromUserId: user.id
    });
  });
  socket.on('call:busy', ({ conversationId, timestamp }) => {
    console.log('[AudioRelay] User busy:', user.id);
    socket.to(`conversation:${conversationId}`).emit('call:busy', {
      conversationId,
      userId: user.id,
      timestamp
    });
  });
  socket.on('call:reject', ({ conversationId, timestamp }) => {
    console.log('[AudioRelay] Call rejected by user', user.id);
    socket.to(`conversation:${conversationId}`).emit('call:reject', {
      conversationId,
      userId: user.id,
      timestamp
    });
  });
  socket.on('disconnect', async () => {
    const activeCallIds = Array.from(socket.data.activeCalls || []);
    activeCallIds.forEach((conversationId) => {
      leaveCall(conversationId, socket);
    });
    const socketsSet = userSockets.get(user.id);
    if (socketsSet) {
      socketsSet.delete(socket);
      if (!socketsSet.size) {
        userSockets.delete(user.id);
    await pool.query('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
        io.emit('presence:update', {
          userId: user.id,
          status: 'offline',
          lastSeen: dayjs().toISOString()
        });
      }
    }
  });
});
function listenWithFallback(serverInstance, initialPort, maxRetries = 10) {
  return new Promise((resolve, reject) => {
    const attempt = (port, retriesLeft) => {
      const onError = (error) => {
        serverInstance.off('listening', onListening);
        serverInstance.off('error', onError);
        if ((error.code === 'EADDRINUSE' || error.code === 'EACCES') && retriesLeft > 0) {
          const nextPort = port + 1;
          console.warn(`Port ${port} is busy. Trying ${nextPort}...`);
          setImmediate(() => attempt(nextPort, retriesLeft - 1));
        } else {
          reject(error);
        }
      };
      const onListening = () => {
        serverInstance.off('error', onError);
        resolve(port);
      };
      serverInstance.once('error', onError);
      serverInstance.once('listening', onListening);
      try {
        serverInstance.listen(port, '0.0.0.0');
      } catch (error) {
        onError(error);
      }
    };
    const startingPort = Number(initialPort) || 0;
    if (!startingPort) {
      reject(new Error('Invalid port number'));
      return;
    }
    attempt(startingPort, maxRetries);
  });
}

async function start() {
  try {
    await initDb();
    const requestedPort = Number(config.port) || 8000;
    const port = await listenWithFallback(server, requestedPort, 10);
    server.on('error', (error) => {
      console.error('Server encountered an error', error);
    });
    console.log('Advanced pink messenger listening on port ' + port);
  } catch (error) {
    if (error && (error.code === 'EADDRINUSE' || error.code === 'EACCES')) {
      console.error('Failed to bind to a port starting from ' + (config.port || 8000) + '. Try setting PORT to a free port.');
    } else {
      console.error('Failed to start server', error);
    }
    process.exit(1);
  }
}
start();
