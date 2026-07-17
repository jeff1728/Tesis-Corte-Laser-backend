import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

import { requireAuth, optionalAuth } from './middlewares/auth.middleware';

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

import authRoutes from './routes/auth.routes';
import aiRoutes from './routes/ai.routes';
import chatRoutes from './routes/chat.routes';

// Rutas básicas de prueba
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Backend de Bezy funcionando correctamente' });
});

// Registrar rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/ai', optionalAuth, aiRoutes);
app.use('/api/chats', requireAuth, chatRoutes);

// Arrancar servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
