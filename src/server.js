import express from 'express';
import ordersRouter from './routes/orders.js';
import { config } from './lib/config.js';

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', config.corsOrigin);
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/orders', ordersRouter);

app.listen(config.port, () => {
  console.log(`order-engine-node listening on port ${config.port}`);
});
