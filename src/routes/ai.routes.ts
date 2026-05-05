import { Router } from 'express';
import { generateImage } from '../controllers/ai.controller';

const router = Router();

router.post('/generate-image', generateImage);

export default router;
