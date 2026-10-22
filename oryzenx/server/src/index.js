const config = require('./config');
const migrate = require('./migrate');
const createApp = require('./app');
const { startWorker } = require('./lib/mail');
const { startJobs } = require('./jobs');

(async () => {
  await migrate();
  const app = createApp();
  app.listen(config.port, () => console.log(`OryzenX BD running on ${config.appUrl} (port ${config.port})`));
  startWorker();
  startJobs();
})().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
