// PM2 process file: pm2 start deploy/ecosystem.config.js && pm2 save
module.exports = {
  apps: [{
    name: 'oryzenx',
    cwd: __dirname + '/../server',
    script: 'src/index.js',
    instances: 1, // keep 1: the email worker and reminder jobs run inside this process
    max_memory_restart: '300M',
    env: { NODE_ENV: 'production' },
  }],
};
