const { ActionTransport } = require('@microfleet/core');
const sendMail = require('../utils/sendMail');

/**
 * Sends message via a predefined account
 * @param  {Mixed} params { account: String, email, [ctx] }
 * @return {Promise}
 */
function predefined({ params }) {
  return this
    .getTransport(params.account)
    .then(transport => sendMail(transport, params.email, params.ctx));
}

module.exports = predefined;
predefined.transports = [ActionTransport.amqp];
