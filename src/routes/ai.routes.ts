import { Router } from 'express';
import { generateVector } from '../controllers/ai.controller';

const router = Router();

router.post('/generate-vector', generateVector);

export default router;
