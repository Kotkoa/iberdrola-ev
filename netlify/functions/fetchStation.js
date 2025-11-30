const IBERDROLA_API_URL =
  'https://www.iberdrola.es/o/webclipb/iberdrola/puntosrecargacontroller/getDatosPuntoRecarga'

const DEFAULT_LANGUAGE = 'en'

const IBERDROLA_HEADERS = {
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'Content-Type': 'application/json; charset=UTF-8',
  'X-Requested-With': 'XMLHttpRequest',
  Origin: 'https://www.iberdrola.es',
  Referer: 'https://www.iberdrola.es/en/electric-mobility/recharge-outside-the-house',
  'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8,es;q=0.7',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
}

const jsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: {
    ...corsHeaders,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
})

const parseBody = (body) => {
  if (!body) return {}
  try {
    return JSON.parse(body)
  } catch {
    return {}
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    }
  }

  const params = event.queryStringParameters || {}
  const body = parseBody(event.body)

  const cuprIdValue = params.cuprId || (typeof body.cuprId === 'string' ? body.cuprId : undefined)
  const languageValue =
    params.language || (typeof body.language === 'string' ? body.language : DEFAULT_LANGUAGE)

  const cuprId = cuprIdValue ? Number(cuprIdValue) : undefined

  if (!cuprId || Number.isNaN(cuprId)) {
    return jsonResponse(400, {
      error: 'Missing or invalid cuprId parameter',
    })
  }

  try {
    const iberdrolaResponse = await fetch(IBERDROLA_API_URL, {
      method: 'POST',
      headers: IBERDROLA_HEADERS,
      body: JSON.stringify({
        dto: { cuprId: [cuprId] },
        language: languageValue || DEFAULT_LANGUAGE,
      }),
    })

    const rawBody = await iberdrolaResponse.text()
    let parsedBody

    try {
      parsedBody = JSON.parse(rawBody)
    } catch (error) {
      if (iberdrolaResponse.ok) {
        return jsonResponse(502, {
          error: `Received non-JSON response from Iberdrola, ${error}`,
          snippet: rawBody.slice(0, 200),
        })
      }
      parsedBody = {
        error: 'Failed to parse Iberdrola error response as JSON',
        snippet: rawBody.slice(0, 200),
      }
    }

    if (!iberdrolaResponse.ok) {
      return jsonResponse(iberdrolaResponse.status, {
        error: 'Request to Iberdrola failed',
        details: parsedBody,
      })
    }

    return jsonResponse(200, parsedBody)
  } catch (error) {
    return jsonResponse(500, {
      error: 'Unexpected error while fetching data from Iberdrola',
      details: error instanceof Error ? error.message : String(error),
    })
  }
}
