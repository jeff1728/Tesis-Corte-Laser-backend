import { Request, Response } from 'express';

// Nuevo pipeline: genera SVG + DXF en lugar de imagen rasterizada
export const generateVector = async (req: Request, res: Response): Promise<void> => {
  try {
    const { prompt } = req.body;

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
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[AI Controller] Error del servicio python:', errorData);
      res.status(response.status).json({ error: 'Error al generar la imagen en el servicio IA', details: errorData });
      return;
    }

    const data = await response.json();

    // El nuevo pipeline devuelve SVG + DXF + reporte de validación
    res.status(200).json({
      status: data.status,
      svg_content: data.svg_content,
      svg_path: data.svg_path,
      dxf_path: data.dxf_path,
      validation_report: data.validation_report,
      retries_used: data.retries_used,
    });
  } catch (error) {
    console.error('[AI Controller] Error interno:', error);
    res.status(500).json({ error: 'Error interno del servidor al procesar la solicitud de IA' });
  }
};
