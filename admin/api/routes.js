const express = require('express');
const router = express.Router();

module.exports = function(pool, io, userSockets, authGuard) {
  
  async function checkAdminStatus(userId) {
    try {
      const [result] = await pool.query(
        'SELECT is_admin FROM users WHERE id = ?',
        [userId]
      );
      return result.length > 0 && Boolean(result[0].is_admin);
    } catch (error) {
      console.error('[Admin] Check admin status error:', error);
      return false;
    }
  }

  router.get('/stats', authGuard, async (req, res) => {
    try {
      const isAdmin = await checkAdminStatus(req.auth.id);
      if (!isAdmin) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const [totalUsersResult] = await pool.query('SELECT COUNT(*) as count FROM users');
      const onlineUsers = userSockets ? userSockets.size : 0;
      const [conversationsResult] = await pool.query('SELECT COUNT(*) as count FROM conversations');
      const [blockedUsersResult] = await pool.query('SELECT COUNT(*) as count FROM users WHERE is_blocked = true');
      const [messagesResult] = await pool.query('SELECT COUNT(*) as count FROM messages');

      res.json({
        totalUsers: parseInt(totalUsersResult[0].count),
        onlineUsers: onlineUsers,
        totalConversations: parseInt(conversationsResult[0].count),
        blockedUsers: parseInt(blockedUsersResult[0].count),
        totalMessages: parseInt(messagesResult[0].count)
      });
    } catch (error) {
      console.error('[Admin] Stats error:', error);
      res.status(500).json({ error: 'Failed to load stats' });
    }
  });

  router.get('/users', authGuard, async (req, res) => {
    try {
      const isAdmin = await checkAdminStatus(req.auth.id);
      if (!isAdmin) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const [result] = await pool.query(`
        SELECT 
          id, 
          public_id, 
          username, 
          display_name,
          is_admin,
          is_blocked,
          created_at,
          last_seen_at
        FROM users
        ORDER BY created_at DESC
      `);

      res.json(result.map(user => ({
        id: user.id,
        publicId: user.public_id,
        username: user.username,
        displayName: user.display_name,
        is_admin: Boolean(user.is_admin),
        is_online: userSockets ? userSockets.has(user.id) : false,
        is_blocked: Boolean(user.is_blocked),
        created_at: user.created_at,
        lastSeenAt: user.last_seen_at
      })));
    } catch (error) {
      console.error('[Admin] Users error:', error);
      res.status(500).json({ error: 'Failed to load users' });
    }
  });

  router.get('/conversations', authGuard, async (req, res) => {
    try {
      const isAdmin = await checkAdminStatus(req.auth.id);
      if (!isAdmin) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const [result] = await pool.query(`
        SELECT 
          c.id,
          c.title,
          c.type,
          c.created_at,
          COUNT(DISTINCT cm.user_id) as member_count,
          COUNT(DISTINCT m.id) as message_count
        FROM conversations c
        LEFT JOIN conversation_members cm ON c.id = cm.conversation_id
        LEFT JOIN messages m ON c.id = m.conversation_id
        GROUP BY c.id, c.title, c.type, c.created_at
        ORDER BY c.created_at DESC
      `);

      res.json(result.map(conv => ({
        id: conv.id,
        name: conv.title || 'Без названия',
        isGroup: conv.type === 'group',
        createdAt: conv.created_at,
        memberCount: parseInt(conv.member_count),
        messageCount: parseInt(conv.message_count)
      })));
    } catch (error) {
      console.error('[Admin] Conversations error:', error);
      res.status(500).json({ error: 'Failed to load conversations' });
    }
  });

  router.post('/users/block', authGuard, async (req, res) => {
    try {
      const isAdmin = await checkAdminStatus(req.auth.id);
      if (!isAdmin) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { userId } = req.body;
      
      await pool.query(
        'UPDATE users SET is_blocked = true WHERE id = ?',
        [userId]
      );

      await pool.query(
        'INSERT INTO admin_logs (admin_id, action, target_user_id, description) VALUES (?, ?, ?, ?)',
        [req.auth.id, 'block_user', userId, `Blocked user ${userId}`]
      );

      const sockets = userSockets.get(userId);
      if (sockets && sockets.length > 0) {
        sockets.forEach(socketId => {
          const userSocket = io.sockets.sockets.get(socketId);
          if (userSocket) {
            userSocket.emit('account:blocked', { reason: 'Your account has been blocked by moderator' });
            userSocket.disconnect(true);
          }
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('[Admin] Block user error:', error);
      res.status(500).json({ error: 'Failed to block user' });
    }
  });

  router.post('/users/unblock', authGuard, async (req, res) => {
    try {
      const isAdmin = await checkAdminStatus(req.auth.id);
      if (!isAdmin) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { userId } = req.body;
      
      await pool.query(
        'UPDATE users SET is_blocked = false WHERE id = ?',
        [userId]
      );

      await pool.query(
        'INSERT INTO admin_logs (admin_id, action, target_user_id, description) VALUES (?, ?, ?, ?)',
        [req.auth.id, 'unblock_user', userId, `Unblocked user ${userId}`]
      );

      res.json({ success: true });
    } catch (error) {
      console.error('[Admin] Unblock user error:', error);
      res.status(500).json({ error: 'Failed to unblock user' });
    }
  });

  router.get('/logs', authGuard, async (req, res) => {
    try {
      const isAdmin = await checkAdminStatus(req.auth.id);
      if (!isAdmin) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const [result] = await pool.query(`
        SELECT 
          al.id,
          al.action,
          al.description,
          al.created_at,
          u.username as admin_username
        FROM admin_logs al
        LEFT JOIN users u ON al.admin_id = u.id
        ORDER BY al.created_at DESC
        LIMIT 100
      `);

      res.json(result);
    } catch (error) {
      console.error('[Admin] Logs error:', error);
      res.status(500).json({ error: 'Failed to load logs' });
    }
  });

  return router;
};
