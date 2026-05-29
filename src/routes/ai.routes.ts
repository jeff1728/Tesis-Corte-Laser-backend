import { Router } from 'express';
import { generateVector, downloadDxf } from '../controllers/ai.controller';

const router = Router();

router.post('/generate-vector', generateVector);
router.get('/download-dxf', downloadDxf);

export default router;
