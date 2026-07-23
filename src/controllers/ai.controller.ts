import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { storageService } from '../services/storage.service';

// Nuevo pipeline: genera SVG + DXF en lugar de imagen rasterizada, con soporte de historial
export const generateVector = async (req: Request, res: Response): Promise<void> => {
  try {
    const generateStartTime = performance.now();
    const {
      prompt,
      canvas_width_mm,
      canvas_height_mm,
      conversacion_id,
      es_evaluacion,
      estilo_salida,
      nivel_detalle,
      linea_grosor,
      trazo_cerrado
    } = req.body;
    const usuario_id = (req as any).user?.id;

    if (!prompt) {
      res.status(400).json({ error: 'El prompt es requerido' });
      return;
    }

    console.log(`[AI Controller] Enviando prompt al pipeline de agentes: "${prompt}"`);

    // Llamamos al microservicio FastAPI en el puerto 8000
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:8000/generate';

    const response = await fetch(pythonServiceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        canvas_width_mm: canvas_width_mm || 100,
        canvas_height_mm: canvas_height_mm || 100,
        estilo_salida: estilo_salida || 'silueta',
        nivel_detalle: nivel_detalle || 'Medio',
        linea_grosor: linea_grosor !== undefined ? linea_grosor : 5.0,
        trazo_cerrado: trazo_cerrado !== undefined ? trazo_cerrado : true
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[AI Controller] Error del servicio python:', errorData);
      res.status(response.status).json({ error: 'Error al generar el vector en el servicio IA', details: errorData });
      return;
    }

    const data = await response.json();
    const tiempo_generacion_segundos = Number(((performance.now() - generateStartTime) / 1000).toFixed(2));

    let activeConversationId = conversacion_id || null;
    let svgUrl = '';
    let dxfUrl = '';

    // --- LOGICA DE GUARDADO AUTOMATICO (Si usuario logueado) ---
    if (usuario_id && data.status === 'success') {
      try {
        // 1. Si no hay conversacion_id, iniciamos un nuevo chat
        if (!activeConversationId) {
          const title = prompt.length > 30 ? `${prompt.substring(0, 30)}...` : prompt;
          const { data: convData, error: convError } = await supabase
            .from('conversaciones')
            .insert({
              usuario_id,
              titulo: title,
              fecha_creacion: new Date().toISOString(),
              fecha_actualizacion: new Date().toISOString()
            })
            .select()
            .single();

          if (convError) {
            throw new Error(`Error al crear conversación: ${convError.message}`);
          }
          activeConversationId = convData.conversacion_id;
          console.log(`[AI Controller] Nueva conversación creada: ${activeConversationId}`);
        }

        // 2. Subimos los archivos al proveedor de almacenamiento (Local o Supabase Storage)
        if (data.svg_path) {
          svgUrl = await storageService.uploadFromUrl(data.svg_path);
        }
        if (data.dxf_path) {
          dxfUrl = await storageService.uploadFromUrl(data.dxf_path);
        }

        // Mapear nivel de detalle de texto a número para la DB
        let nivelDb = 2;
        if (nivel_detalle === 'Bajo') nivelDb = 1;
        if (nivel_detalle === 'Alto') nivelDb = 3;

        // 3. Insertamos el diseño en registros_disenos
        const { data: designData, error: designError } = await supabase
          .from('registros_disenos')
          .insert({
            conversacion_id: activeConversationId,
            usuario_id: usuario_id,
            prompt,
            salida_estilo: estilo_salida || 'silueta',
            nivel_detalle: nivelDb,
            linea_grosor: linea_grosor !== undefined ? linea_grosor : 5.0,
            trazo_cerrado: trazo_cerrado !== undefined ? trazo_cerrado : true,
            canva_tamano: `${canvas_width_mm || 100}x${canvas_height_mm || 100}`,
            estado: 'success',
            fecha_creacion: new Date().toISOString()
          })
          .select()
          .single();

        if (designError) {
          throw new Error(`Error al registrar diseño: ${designError.message}`);
        }

        // Guardar en metricas_evaluacion si es una solicitud de evaluacion
        if (es_evaluacion) {
          try {
            const report = data.validation_report || {};
            const es_valido_svg = report.is_valid ?? null;

            // Calculamos el porcentaje nosotros mismos porque el schema de Python solo da el total y las cerradas
            let porcentaje_rutas_cerradas = 0;
            if (report.total_paths && report.total_paths > 0) {
              porcentaje_rutas_cerradas = Number(((report.closed_paths || 0) / report.total_paths * 100).toFixed(2));
            }

            // Aseguramos de que siempre caiga en un array para evitar nulos y contar correctamente
            const errorsArray = Array.isArray(report.errors) ? report.errors : [];
            const errores_geometricos = errorsArray.length;
            const tipo_error = errorsArray;

            const { error: metricsError } = await supabase
              .from('metricas_evaluacion')
              .insert({
                registro_id: designData.registro_id,
                es_valido_svg,
                reintentos: data.retries_used || 0,
                tiempo_generacion_segundos,
                porcentaje_rutas_cerradas,
                errores_geometricos,
                tipo_error
              });

            if (metricsError) {
              console.error('[AI Controller] Error al guardar métricas de evaluación:', metricsError);
            }
          } catch (metricsErr) {
            console.error('[AI Controller] Error general guardando métricas:', metricsErr);
          }
        }

        // 4. Insertamos las rutas de los archivos en generacion_archivos
        const filesToInsert = [];
        if (svgUrl) {
          filesToInsert.push({
            registro_id: designData.registro_id,
            tipo_archivo: 'svg',
            ruta_almacenamiento: svgUrl,
            tamano_bytes: data.svg_content ? Buffer.byteLength(data.svg_content, 'utf-8') : 0,
            fecha_creacion: new Date().toISOString()
          });
        }
        if (dxfUrl) {
          filesToInsert.push({
            registro_id: designData.registro_id,
            tipo_archivo: 'dxf',
            ruta_almacenamiento: dxfUrl,
            tamano_bytes: 0,
            fecha_creacion: new Date().toISOString()
          });
        }

        if (filesToInsert.length > 0) {
          const { error: filesError } = await supabase
            .from('generacion_archivos')
            .insert(filesToInsert);

          if (filesError) {
            console.error('[AI Controller] Error al guardar referencias de archivos:', filesError);
          }
        }

        // 4.5 Insertar las métricas de consumo de tokens/imágenes en consumo_api
        if (data.usage_metrics && Array.isArray(data.usage_metrics) && data.usage_metrics.length > 0) {
          const metricsToInsert = data.usage_metrics.map((metric: any) => ({
            usuario_id: usuario_id,
            registro_id: designData.registro_id,
            modelo: metric.modelo,
            tipo_operacion: metric.tipo_operacion,
            tokens_totales: metric.tokens_totales || 0,
            imagenes_generadas: metric.imagenes_generadas || 0,
            costo_usd: metric.costo_usd || 0.0,
            fecha_creacion: new Date().toISOString()
          }));

          const { error: usageError } = await supabase
            .from('consumo_api')
            .insert(metricsToInsert);

          if (usageError) {
            console.error('[AI Controller] Error al guardar métricas de consumo:', usageError);
          }
        }

        // 5. Actualizamos fecha_actualizacion de la conversación para ordenarla primero
        await supabase
          .from('conversaciones')
          .update({ fecha_actualizacion: new Date().toISOString() })
          .eq('conversacion_id', activeConversationId);

      } catch (dbErr) {
        console.error('[AI Controller] Error en el flujo de guardado de base de datos:', dbErr);
        // Continuamos y retornamos el SVG al usuario para que no se frustre el flujo interactivo
      }
    }

    // Retornamos SVG, DXF y detalles
    res.status(200).json({
      status: data.status,
      svg_content: data.svg_content,
      svg_path: svgUrl || data.svg_path,
      dxf_path: dxfUrl || data.dxf_path,
      conversacion_id: activeConversationId,
      validation_report: data.validation_report,
      retries_used: data.retries_used,
    });
  } catch (error) {
    console.error('[AI Controller] Error interno:', error);
    res.status(500).json({ error: 'Error interno del servidor al procesar la solicitud de IA' });
  }
};

export const downloadDxf = async (req: Request, res: Response): Promise<void> => {
  try {
    const { filepath } = req.query;

    if (!filepath || typeof filepath !== 'string') {
      res.status(400).json({ error: 'La ruta del archivo es requerida' });
      return;
    }

    console.log(`[AI Controller] Solicitando descarga de DXF para: ${filepath}`);

    let fileUrl = filepath;
    if (!filepath.startsWith('http://') && !filepath.startsWith('https://')) {
      const pythonServiceUrlBase = process.env.PYTHON_SERVICE_URL_BASE || 'http://127.0.0.1:8000';
      const relativePath = filepath.replace(/^\.\//, '');
      fileUrl = `${pythonServiceUrlBase}/${relativePath}`;
    }

    console.log(`[AI Controller] Descargando DXF desde: ${fileUrl}`);

    const response = await fetch(fileUrl);
    if (!response.ok) {
      res.status(404).json({ error: 'El archivo DXF no se encuentra disponible en el servicio de IA' });
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filename = filepath.split(/[/\\]/).pop() || 'diseno.dxf';

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/dxf');
    res.send(buffer);
  } catch (error) {
    console.error('[AI Controller] Error en descarga de DXF:', error);
    res.status(500).json({ error: 'Error al procesar la descarga del archivo DXF' });
  }
};

export const getUserMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const usuario_id = (req as any).user?.id;
    if (!usuario_id) {
      res.status(401).json({ error: 'Falta usuario autenticado' });
      return;
    }

    const { data, error } = await supabase
      .from('consumo_api')
      .select('*')
      .eq('usuario_id', usuario_id)
      .order('fecha_creacion', { ascending: false });

    if (error) {
      console.error('[AI Controller] Error al obtener métricas:', error);
      res.status(500).json({ error: 'Error al consultar métricas' });
      return;
    }

    res.status(200).json({ data });
  } catch (error) {
    console.error('[AI Controller] Error interno obteniendo métricas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
