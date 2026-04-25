import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Nos aseguramos de cargar las variables de entorno
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan las credenciales de Supabase en el archivo .env');
}

// Creamos y exportamos la instancia de conexión
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
