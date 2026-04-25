import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

// Registro de Usuario
export const registerUser = async (req: Request, res: Response): Promise<void> => {
  const { email, password, full_name } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'El email y la contraseña son obligatorios.' });
    return;
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: full_name || '',
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
    const { data, error } = await supabase.auth.signInWithPassword({
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
