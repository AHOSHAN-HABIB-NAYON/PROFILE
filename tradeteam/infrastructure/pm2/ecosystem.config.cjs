/**
 * PM2 process file (for hosts without systemd, e.g. many Node.js panels).
 *   pm2 start infrastructure/pm2/ecosystem.config.cjs && pm2 save
 * Single-process mode by default. For scaling, see docs/DEPLOYMENT.md (role split):
 * exactly ONE process may run the matching engine (RUN_ENGINE=true).
 */
module.exports = {
  apps: [
    {
      name: 'tradeteam',
      script: 'apps/api/dist/server.js',
      cwd: __dirname + '/../..',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production', PORT: 3000, HOST: '127.0.0.1' },
      max_memory_restart: '1500M',
      kill_timeout: 30000,
      time: true,
    },
  ],
};
