/**
 * Sends message via a predefined account
 * @param  {Mixed} params { account: String, email, [ctx] }
 * @return {Promise}
 */
module.exports = function predefined({ params }) {
  return this
    .getTransport(params.account)
    .then(transport => this.sendMail(transport, params.email, params.ctx));
};
