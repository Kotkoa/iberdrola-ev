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

const https = require('https');

function httpsRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Failed to parse JSON response'));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

module.exports = async function (context, req) {
  try {
    context.log('Iberdrola proxy request received');

    // Parse body if it's a string
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        context.log.error('Failed to parse body as JSON');
        body = null;
      }
    }

    // Validate request
    if (!body || !body.endpoint || !body.payload) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing required fields: endpoint, payload' }),
      };
      return;
    }

    const { endpoint, payload } = body;

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: `Invalid endpoint: ${endpoint}. Must be 'list' or 'details'`,
        }),
      };
      return;
    }

    context.log(`Proxying ${endpoint} request to Iberdrola API`);

    const data = await httpsRequest(
      url,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
      },
      payload
    );

    context.log(`Successfully proxied ${endpoint} request`);

    context.res = {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: JSON.stringify(data),
    };
  } catch (error) {
    context.log.error('Proxy error:', error);

    context.res = {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to fetch from Iberdrola API',
        details: error.message || String(error),
      }),
    };
  }
};
