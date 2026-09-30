import http from 'http';
import app from './app';
import { appConfig } from './config';

const PORT = appConfig.port || 5000;

const server = http.createServer(app);

server.listen(PORT, async () => {
  console.log(`ServiSync server running on port ${PORT} in ${appConfig.env} mode`);
  try {
    const { autoSeed } = await import('./utils/autoSeed');
    await autoSeed();
  } catch (err) {
    console.warn('AutoSeed warning:', err);
  }
});

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
