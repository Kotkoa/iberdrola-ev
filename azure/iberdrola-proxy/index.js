/**
 * Azure Function: Iberdrola API Proxy
 *
 * Proxies requests to Iberdrola charging station API.
 * Uses Azure IP ranges which are not blocked by Akamai CDN.
 *
 * Request body:
 * {
 *   "endpoint": "list" | "details",
 *   "payload": { ... }
 * }
 */

module.exports = async function (context, req) {
  context.log('Iberdrola proxy request received');

  // Validate request
  if (!req.body || !req.body.endpoint || !req.body.payload) {
    context.res = {
      status: 400,
      body: { error: 'Missing required fields: endpoint, payload' },
    };
    return;
  }

  const { endpoint, payload } = req.body;

  // Endpoint mapping
  const IBERDROLA_BASE_URL =
    'https://www.iberdrola.es/o/webclipb/iberdrola/puntosrecargacontroller';
  const ENDPOINTS = {
    list: `${IBERDROLA_BASE_URL}/getListarPuntosRecarga`,
    details: `${IBERDROLA_BASE_URL}/getDatosPuntoRecarga`,
  };

  const url = ENDPOINTS[endpoint];
  if (!url) {
    context.res = {
      status: 400,
      body: { error: `Invalid endpoint: ${endpoint}. Must be 'list' or 'details'` },
    };
    return;
  }

  try {
    context.log(`Proxying ${endpoint} request to Iberdrola API`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      context.log.error(`Iberdrola API error: ${response.status}`);
      throw new Error(`Iberdrola API returned status ${response.status}`);
    }

    const data = await response.json();
    context.log(`Successfully proxied ${endpoint} request`);

    context.res = {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // Configure for your domain in production
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: data,
    };
  } catch (error) {
    context.log.error('Proxy error:', error.message);

    context.res = {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: {
        error: 'Failed to fetch from Iberdrola API',
        details: error.message,
      },
    };
  }
};
