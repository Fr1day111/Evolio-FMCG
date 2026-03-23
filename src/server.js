import express from 'express';
import ordersRouter from './routes/orders.js';
import { config } from './lib/config.js';

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/orders', ordersRouter);

app.listen(config.port, () => {
  console.log(`order-engine-node listening on port ${config.port}`);
});
