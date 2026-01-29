/**
 * Test version - returns mock data immediately
 */

module.exports = async function (context, req) {
  context.log('Test function called');

  context.res = {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      success: true,
      message: 'Azure proxy is working',
      received: {
        hasBody: !!req.body,
        bodyType: typeof req.body,
      },
    }),
  };
};
