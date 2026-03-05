import express from 'express';
import { postMessage } from '../controllers/chatController.js';

const router = express.Router();

/**
 * POST /api/chat
 * Body: { text: string }
 * Response: { text: string } — përgjigja e botit
 */
router.post('/', postMessage);

export default router;
