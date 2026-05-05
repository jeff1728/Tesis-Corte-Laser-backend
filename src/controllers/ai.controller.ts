import { Request, Response } from 'express';

export const generateImage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      res.status(400).json({ error: 'El prompt es requerido' });
      return;
    }

    console.log(`[AI Controller] Enviando prompt al servicio python: "${prompt}"`);

    // Llamamos al servicio de Python local
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:5000/generate';
    
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
    
    // Devolvemos la imagen en base64 al frontend
    res.status(200).json({ image: data.image });
  } catch (error) {
    console.error('[AI Controller] Error interno:', error);
    res.status(500).json({ error: 'Error interno del servidor al procesar la solicitud de IA' });
  }
};
