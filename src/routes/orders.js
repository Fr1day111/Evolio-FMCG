import { Router } from 'express';
import { processSenderOrderDay } from '../services/orderEngine.js';

const router = Router();

router.post('/process-sender', async (req, res) => {
  try {
    const { sender_id: senderId } = req.body ?? {};
    const result = await processSenderOrderDay(senderId);
    res.json({ ok: true, data: result });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

export default router;
