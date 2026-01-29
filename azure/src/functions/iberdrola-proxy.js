const { app } = require('@azure/functions');
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

app.http('iberdrola-proxy', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {
      context.log('Iberdrola proxy request received');

      const body = await request.json();

      // Validate request
      if (!body || !body.endpoint || !body.payload) {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Missing required fields: endpoint, payload' }),
        };
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
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: `Invalid endpoint: ${endpoint}. Must be 'list' or 'details'`,
          }),
        };
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

      return {
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
      context.log('Proxy error:', error);

      return {
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
  },
});
