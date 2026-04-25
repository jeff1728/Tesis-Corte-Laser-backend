import { Router } from 'express';
import { registerUser, loginUser } from '../controllers/auth.controller';

const router = Router();

// Rutas de autenticación
router.post('/registro', registerUser);
router.post('/login', loginUser);

export default router;
