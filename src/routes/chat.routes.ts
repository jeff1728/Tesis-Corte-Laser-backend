import { Router } from 'express';
import { getConversations, deleteConversation, getConversationHistory } from '../controllers/chat.controller';

const router = Router();

router.get('/', getConversations);
router.delete('/:id', deleteConversation);
router.get('/:id/history', getConversationHistory);

export default router;
