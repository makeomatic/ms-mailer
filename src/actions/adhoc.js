const Promise = require('bluebird');

/**
 * Sends message via passed auth params for the account
 * @param  {Mixed}    message { account: Object, email }
 * @param  {Object}   headers
 * @param  {Object}   actions - not handled at the moment
 * @return {Promise}
 */
module.exports = function adhoc(message) {
  const disposableConnection = this.initDisposableTransport(message.account);
  return Promise.using(disposableConnection, (transport) => {
    return this.sendMail(transport, message.email);
  });
};
