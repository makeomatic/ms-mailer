const Promise = require('bluebird');
const { ActionTransport } = require('@microfleet/plugin-router');

/**
 * Sends message via passed auth params for the account
 * @param  {Object}  params
 * @param  {Object}  params.account
 * @param  {Object}  params.email
 * @param  {Object} [params.ctx]
 * @return {Promise}
 */
function adhoc({ params }) {
  const disposableConnection = this.initDisposableTransport(params.account, { pool: false });
  return Promise.using(disposableConnection, (transport) => (
    this.constructor.sendMail(transport, params.email, params.ctx)
  ));
}

module.exports = adhoc;
adhoc.transports = [ActionTransport.amqp];
