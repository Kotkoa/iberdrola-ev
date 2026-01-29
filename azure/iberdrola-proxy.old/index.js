/**
 * Ultra-simple sync version
 */

module.exports = function (context) {
  context.log('Simple sync function called');

  context.res = {
    status: 200,
    body: 'Hello from Azure Functions!',
  };

  context.done();
};
