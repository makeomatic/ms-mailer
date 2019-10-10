const { ActionTransport } = require('@microfleet/core');
const sendMail = require('../utils/sendMail');

/**
 * Sends message via a predefined account
 * @param  {Mixed} params { account: String, email, [ctx] }
 * @return {Promise}
 */
async function predefined({ params }) {
  const transport = await this.getTransport(params.account);
  return sendMail(transport, params.email, params.ctx);
}

module.exports = predefined;
predefined.transports = [ActionTransport.amqp];
