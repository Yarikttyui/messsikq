module.exports = {
  apps: [
    {
      name: 'pink-messenger',
      script: './src/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'development',
        PORT: 8000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 8000
      }
    },
    {
      name: 'admin-panel',
      script: './admin/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '128M',
      env: {
        NODE_ENV: 'development',
        ADMIN_PORT: 8080
      },
      env_production: {
        NODE_ENV: 'production',
        ADMIN_PORT: 8080
      }
    }
  ]
};
