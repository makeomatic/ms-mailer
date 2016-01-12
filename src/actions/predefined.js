/**
 * Sends message via a predefined account
 * @param  {Mixed}    message { account: String, email }
 * @param  {Object}   headers
 * @param  {Object}   actions - not handled at the moment
 * @return {Promise}
 */
module.exports = function predefined(message) {
  return this.getTransport(message.account)
    .then(transport => {
      return this.sendMail(transport, message.email);
    });
};
