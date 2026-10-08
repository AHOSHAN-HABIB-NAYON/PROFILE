// Entry file for hosts that start "server.js" (e.g. Hostinger Node.js apps).
// Starts the prebuilt server bundle, which also serves the game and the admin panel.
import('./apps/server/dist/index.js').catch((err) => {
  console.error('Failed to start QUIZ WAR server', err);
  process.exit(1);
});
