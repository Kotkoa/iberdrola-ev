import type { VercelRequest, VercelResponse } from '@vercel/node';

const IBERDROLA_BASE_URL = 'https://www.iberdrola.es/o/webclipb/iberdrola/puntosrecargacontroller';

const ENDPOINTS = {
  list: `${IBERDROLA_BASE_URL}/getListarPuntosRecarga`,
  details: `${IBERDROLA_BASE_URL}/getDatosPuntoRecarga`,
} as const;

type EndpointType = keyof typeof ENDPOINTS;

interface ProxyRequestBody {
  endpoint: EndpointType;
  payload: unknown;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { endpoint, payload } = req.body as ProxyRequestBody;

    // Validate endpoint
    if (!endpoint || !ENDPOINTS[endpoint]) {
      res.status(400).json({ error: 'Invalid endpoint. Use "list" or "details"' });
      return;
    }

    const targetUrl = ENDPOINTS[endpoint];

    // Forward request to Iberdrola API
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; IberdrolaEVMonitor/1.0)',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      res.status(response.status).json({
        error: `Iberdrola API error: ${response.status}`,
        upstream_status: response.status,
      });
      return;
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Proxy request failed',
    });
  }
}
