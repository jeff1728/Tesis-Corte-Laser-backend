import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

// 1. Obtener lista de conversaciones de un usuario
export const getConversations = async (req: Request, res: Response): Promise<void> => {
  try {
    const usuario_id = (req as any).user?.id;

    if (!usuario_id) {
      res.status(401).json({ error: 'Falta usuario autenticado' });
      return;
    }

    console.log(`[Chat Controller] Obteniendo conversaciones para el usuario: ${usuario_id}`);

    const { data, error } = await supabase
      .from('conversaciones')
      .select('*')
      .eq('usuario_id', usuario_id)
      .order('fecha_actualizacion', { ascending: false });

    if (error) {
      console.error('[Chat Controller] Error Supabase:', error);
      res.status(500).json({ error: 'Error al consultar las conversaciones', details: error.message });
      return;
    }

    res.status(200).json(data || []);
  } catch (error) {
    console.error('[Chat Controller] Error interno:', error);
    res.status(500).json({ error: 'Error interno del servidor al obtener conversaciones' });
  }
};

// 2. Eliminar una conversación (elimina en cascada por ON DELETE CASCADE en BDD)
export const deleteConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({ error: 'El id de conversación es obligatorio' });
      return;
    }

    console.log(`[Chat Controller] Eliminando conversación: ${id}`);

    const { error } = await supabase
      .from('conversaciones')
      .delete()
      .eq('conversacion_id', id);

    if (error) {
      console.error('[Chat Controller] Error al eliminar:', error);
      res.status(500).json({ error: 'Error al eliminar la conversación', details: error.message });
      return;
    }

    res.status(200).json({ message: 'Conversación eliminada exitosamente' });
  } catch (error) {
    console.error('[Chat Controller] Error interno al eliminar:', error);
    res.status(500).json({ error: 'Error interno del servidor al eliminar conversación' });
  }
};

// 3. Obtener el historial cronológico de un chat (diseños + sus archivos)
export const getConversationHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({ error: 'El id de conversación es obligatorio' });
      return;
    }

    console.log(`[Chat Controller] Obteniendo historial para la conversación: ${id}`);

    const { data, error } = await supabase
      .from('registros_disenos')
      .select(`
        *,
        generacion_archivos (
          archivo_id,
          tipo_archivo,
          ruta_almacenamiento,
          tamano_bytes,
          fecha_creacion
        )
      `)
      .eq('conversacion_id', id)
      .order('fecha_creacion', { ascending: true });

    if (error) {
      console.error('[Chat Controller] Error al consultar historial:', error);
      res.status(500).json({ error: 'Error al consultar el historial de la conversación', details: error.message });
      return;
    }

    res.status(200).json(data || []);
  } catch (error) {
    console.error('[Chat Controller] Error interno en historial:', error);
    res.status(500).json({ error: 'Error interno del servidor al obtener historial' });
  }
};
