import http from 'http';
import app from './app';
import { appConfig } from './config';

const PORT = appConfig.port || 5000;

const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`ServiSync server running on port ${PORT} in ${appConfig.env} mode`);
});

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
