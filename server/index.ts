import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';

import placesRouter from './routes/places.js';
import geocodeRouter from './routes/geocode.js';
import narrateRouter from './routes/narrate.js';
import directionsRouter from './routes/directions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Trust proxy for express-rate-limit to work correctly in Cloud Run/Proxy environments
  app.set('trust proxy', 1);

  app.use(cors());
  app.use(express.json());

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // Limit each IP to 60 requests per `window` (here, per minute)
    message: 'Too many requests from this IP, please try again after a minute',
  });
  app.use('/api/', limiter);

  // API Routes
  app.use('/api/places', placesRouter);
  app.use('/api/geocode', geocodeRouter);
  app.use('/api/narrate', narrateRouter);
  app.use('/api/directions', directionsRouter);

  // Vite middleware for development
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

  app.listen(PORT, () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
