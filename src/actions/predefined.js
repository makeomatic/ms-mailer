const { ActionTransport } = require('@microfleet/plugin-router');

/**
 * Sends message via a predefined account
 * @param  {Object}  params
 * @param  {String}  params.account
 * @param  {Object}  params.email
 * @param  {Object} [params.ctx]
 * @return {Promise}
 */
async function predefined({ params }) {
  const transport = await this.getTransport(params.account);
  return this.constructor.sendMail(transport, params.email, params.ctx);
}

module.exports = predefined;
predefined.transports = [ActionTransport.amqp];
