const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:8080',
      'https://flatteringly-lush-caracara.cloudpub.ru'
    ],
    credentials: true
  }
});

app.use(cors({
  origin: [
    'http://localhost:8080',
    'https://flatteringly-lush-caracara.cloudpub.ru'
  ],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pink_messenger',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const authGuard = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    req.auth = { id: decoded.userId };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const userSockets = new Map();

app.use('/styles', express.static(path.join(process.cwd(), 'public', 'styles')));
app.use('/admin/styles', express.static(path.join(process.cwd(), 'admin', 'styles')));
app.use('/admin/scripts', express.static(path.join(process.cwd(), 'admin', 'scripts')));
app.use('/scripts/modules', express.static(path.join(process.cwd(), 'public', 'scripts', 'modules')));

app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'admin', 'views', 'index.html'));
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const bcrypt = require('bcryptjs');
    const jwt = require('jsonwebtoken');

    const [users] = await pool.query(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (error) {
    console.error('[Admin] Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

const adminRoutes = require(path.join(process.cwd(), 'admin', 'api', 'routes.js'))(pool, io, userSockets, authGuard);
app.use('/api/admin', adminRoutes);

io.on('connection', (socket) => {
  console.log('[Admin] Socket connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('[Admin] Socket disconnected:', socket.id);
  });
});

const PORT = process.env.ADMIN_PORT || 8080;

server.listen(PORT, () => {
  console.log(`Admin Panel listening on port ${PORT}`);
  console.log(`Access admin panel at: http://localhost:${PORT}`);
});
