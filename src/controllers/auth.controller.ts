import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../config/supabase';

// Inicializamos un cliente puro y sin estado para manejar autenticaciones sin
// contaminar el singleton global administrativo que usamos para bypass de RLS.
const authClient = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || '',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
);

// Registro de Usuario
export const registerUser = async (req: Request, res: Response): Promise<void> => {
  const { email, password, nombres, apellidos } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'El email y la contraseña son obligatorios.' });
    return;
  }

  try {
    const { data, error } = await authClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/auth/confirmado` : 'http://localhost:5173/auth/confirmado',
        data: {
          nombres: nombres || '',
          apellidos: apellidos || ''
        }
      }
    });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.status(201).json({ message: 'Usuario registrado exitosamente', data });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor al registrar usuario.' });
  }
};

// Inicio de Sesión
export const loginUser = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'El email y la contraseña son obligatorios.' });
    return;
  }

  try {
    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      res.status(401).json({ error: 'Credenciales inválidas.' });
      return;
    }

    res.status(200).json({ message: 'Inicio de sesión exitoso', data });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor al iniciar sesión.' });
  }
};

// Cierre de Sesión
export const logoutUser = async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token no proporcionado.' });
    return;
  }
  const token = authHeader.split(' ')[1];

  try {
    // Crear un cliente temporal con el token del usuario para revocar su sesión
    const tempClient = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_ANON_KEY || '',
      {
        global: {
          headers: { Authorization: `Bearer ${token}` }
        }
      }
    );

    const { error } = await tempClient.auth.signOut();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.status(200).json({ message: 'Sesión cerrada exitosamente.' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno al cerrar sesión.' });
  }
};

// Actualizar Perfil
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token no proporcionado.' });
    return;
  }
  const token = authHeader.split(' ')[1];
  const { nombres, apellidos, avatar_url } = req.body;

  try {
    // 1. Obtener el usuario autenticado a partir del token (stateless)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      res.status(401).json({ error: 'Token inválido o sesión expirada.' });
      return;
    }

    // 2. Usar la API de admin para actualizar la metainformación del usuario
    const { data, error } = await supabase.auth.admin.updateUserById(
      user.id,
      { user_metadata: { nombres, apellidos, avatar_url } }
    );

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    // 3. Actualizar la tabla pública usuarios en Supabase DB
    const updatePayload: Record<string, any> = {};
    if (nombres !== undefined) updatePayload.nombres = nombres;
    if (apellidos !== undefined) updatePayload.apellidos = apellidos;
    if (avatar_url !== undefined) updatePayload.foto_url = avatar_url;

    if (Object.keys(updatePayload).length > 0) {
      const { error: dbError } = await supabase
        .from('usuarios')
        .update(updatePayload)
        .eq('usuario_id', user.id);

      if (dbError) {
        console.error('[Auth Controller] Error actualizando tabla publica usuarios:', dbError);
      }
    }

    res.status(200).json({ message: 'Perfil actualizado exitosamente', data: data.user });
  } catch (err) {
    res.status(500).json({ error: 'Error interno al actualizar perfil.' });
  }
};
