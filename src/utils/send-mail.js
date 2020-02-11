const Promise = require('bluebird');
const is = require('is');
const render = require('ms-mailer-templates');

/**
 * Promise wrapper over smtp transport
 * @param  {Object} transport
 * @param  {Object} email
 * @return {Promise}
 */
module.exports = async function sendMail(transport, email, ctx) {
  const renderedTemplate = is.string(email)
    ? await Promise.props({
      ...ctx.nodemailer,
      html: render(email, ctx.template),
    })
    : email;

  return Promise.fromNode((next) => {
    transport.sendMail(renderedTemplate, next);
  });
};
