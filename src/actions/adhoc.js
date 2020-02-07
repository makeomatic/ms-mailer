const Promise = require('bluebird');
const { ActionTransport } = require('@microfleet/core');

const sendMail = require('../utils/send-mail');

/**
 * Sends message via passed auth params for the account
 * @param  {Mixed} params { account: Object, email, [ctx] }
 * @return {Promise}
 */
function adhoc({ params }) {
  const disposableConnection = this.initDisposableTransport(params.account, { pool: false });
  return Promise.using(disposableConnection, (transport) => (
    sendMail(transport, params.email, params.ctx)
  ));
}

module.exports = adhoc;
adhoc.transports = [ActionTransport.amqp];
