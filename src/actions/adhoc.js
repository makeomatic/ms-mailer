const Promise = require('bluebird');

/**
 * Sends message via passed auth params for the account
 * @param  {Mixed} params { account: Object, email, [ctx] }
 * @return {Promise}
 */
module.exports = function adhoc({ params }) {
  const disposableConnection = this.initDisposableTransport(params.account);
  return Promise.using(disposableConnection, (transport) => (
    this.sendMail(transport, params.email, params.ctx)
  ));
};
