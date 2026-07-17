import { Router } from 'express';
import { registerUser, loginUser, logoutUser } from '../controllers/auth.controller';

const router = Router();

// Rutas de autenticación
router.post('/registro', registerUser);
router.post('/login', loginUser);
router.post('/logout', logoutUser);

export default router;
