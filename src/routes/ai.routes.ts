import { Router } from 'express';
import { generateVector, downloadDxf, getUserMetrics } from '../controllers/ai.controller';

const router = Router();

router.post('/generate-vector', generateVector);
router.get('/download-dxf', downloadDxf);
router.get('/user-metrics', getUserMetrics);

export default router;
