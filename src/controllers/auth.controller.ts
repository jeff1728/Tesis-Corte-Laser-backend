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
  const { nombres, apellidos } = req.body;
  let { avatar_url } = req.body;

  try {
    // 1. Obtener el usuario autenticado a partir del token (stateless)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      res.status(401).json({ error: 'Token inválido o sesión expirada.' });
      return;
    }

    // Procesar Base64 avatar_url si está presente
    if (avatar_url && avatar_url.startsWith('data:image')) {
      const matches = avatar_url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        const extension = mimeType.split('/')[1] || 'png';
        const fileName = `${user.id}_${Date.now()}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, buffer, {
            contentType: mimeType,
            upsert: true
          });

        if (uploadError) {
          console.error("[Auth Controller] Error al subir avatar:", uploadError);
          res.status(400).json({ error: 'Error al subir la imagen.' });
          return;
        }

        const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
        avatar_url = publicUrlData.publicUrl;
      }
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

// Actualizar Contraseña
export const updatePassword = async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token no proporcionado.' });
    return;
  }
  const token = authHeader.split(' ')[1];
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Contraseña actual y nueva son requeridas.' });
    return;
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user || !user.email) {
      res.status(401).json({ error: 'Token inválido o sesión expirada.' });
      return;
    }

    // Verificar contraseña actual usando el authClient para simular un login
    const { error: signInError } = await authClient.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signInError) {
      res.status(401).json({ error: 'La contraseña actual es incorrecta.' });
      return;
    }

    // Actualizar con la nueva contraseña usando la API de admin
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );

    if (updateError) {
      res.status(400).json({ error: updateError.message });
      return;
    }

    res.status(200).json({ message: 'Contraseña actualizada exitosamente' });
  } catch (err) {
    console.error("[Auth Controller] Error al actualizar contraseña:", err);
    res.status(500).json({ error: 'Error interno al actualizar contraseña.' });
  }
};
