import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { authenticate, getCredentials } from './server/security.js';
import { apiErrorHandler, apiRouter } from './server/routes/api.js';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('Invalid PORT');
  getCredentials();
  console.log('Local login: .runtime/login.txt (or configured APP_USERNAME / APP_PASSWORD).');
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => req.path === '/health' ? next() : authenticate(req, res, next));

  // JSON and URL-encoded body parser middleware
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  // API routes — ONE static router instance.
  // Route changes require a backend process restart (tsx watch handles this in dev);
  // never rely on per-request dynamic re-imports, which can serve stale handlers.
  app.use('/api', apiRouter);

  app.use(apiErrorHandler);
  app.use(authenticate);

  // Vite development middleware vs production static server
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '127.0.0.1', () => {
    console.log(`Server running on http://127.0.0.1:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
