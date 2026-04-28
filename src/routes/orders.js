import { Router } from 'express';
import { processSenderOrderDay } from '../services/orderEngine.js';
import { processSenderEmailOrderDay } from '../services/emailOrderEngine.js';
import { saveProductMapping } from '../services/productResolution.js';

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

router.post('/process-email-sender', async (req, res) => {
  try {
    const { sender_id: senderId } = req.body ?? {};
    const result = await processSenderEmailOrderDay(senderId);
    res.json({ ok: true, data: result });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/product-mappings', async (req, res) => {
  try {
    const mapping = await saveProductMapping(req.body ?? {});
    res.json({ ok: true, data: mapping });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

export default router;
