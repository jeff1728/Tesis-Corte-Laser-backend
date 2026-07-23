import { Router } from 'express';
import { registerUser, loginUser, logoutUser, updateProfile } from '../controllers/auth.controller';

const router = Router();

// Rutas de autenticación
router.post('/registro', registerUser);
router.post('/login', loginUser);
router.post('/logout', logoutUser);

// Rutas de perfil
router.put('/perfil', updateProfile);

export default router;
