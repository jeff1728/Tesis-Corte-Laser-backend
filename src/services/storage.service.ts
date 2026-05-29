import { supabase } from '../config/supabase';

export interface IStorageService {
  uploadFromUrl(pythonRelativePath: string): Promise<string>;
}

export class LocalDiskStorage implements IStorageService {
  async uploadFromUrl(pythonRelativePath: string): Promise<string> {
    // En desarrollo local, los archivos ya residen en el disco del microservicio.
    // Simplemente retornamos la ruta original (e.g., "./output/bezy_xyz.dxf").
    return pythonRelativePath;
  }
}

export class SupabaseStorage implements IStorageService {
  async uploadFromUrl(pythonRelativePath: string): Promise<string> {
    try {
      const pythonServiceUrlBase = process.env.PYTHON_SERVICE_URL_BASE || 'http://127.0.0.1:8000';
      const relativePath = pythonRelativePath.replace(/^\.\//, '');
      const fileUrl = `${pythonServiceUrlBase}/${relativePath}`;

      console.log(`[Storage Service] Descargando de microservicio para subir a Supabase: ${fileUrl}`);

      // 1. Descargamos el archivo desde el microservicio Python
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`No se pudo descargar el archivo desde el microservicio en ${fileUrl}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const filename = pythonRelativePath.split(/[/\\]/).pop() || `vector_${Date.now()}`;
      const extension = filename.split('.').pop() || '';
      
      const bucketName = 'vectores-corte';
      const mimeType = extension === 'dxf' ? 'application/dxf' : 'image/svg+xml';

      // 2. Subimos a Supabase Storage
      const { error } = await supabase.storage
        .from(bucketName)
        .upload(filename, buffer, {
          contentType: mimeType,
          upsert: true
        });

      if (error) {
        throw new Error(`Error de Supabase Storage: ${error.message}`);
      }

      // 3. Obtenemos la URL pública
      const { data: { publicUrl } } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filename);

      console.log(`[Storage Service] Archivo subido con éxito a Supabase Storage: ${publicUrl}`);
      return publicUrl;
    } catch (err) {
      console.error('[Storage Service] Error al subir a Supabase:', err);
      // Retorna la ruta de fallback si falla en producción para evitar crash total
      return pythonRelativePath;
    }
  }
}

export const storageService = process.env.NODE_ENV === 'production'
  ? new SupabaseStorage()
  : new LocalDiskStorage();
