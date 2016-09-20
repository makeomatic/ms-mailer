const Promise = require('bluebird');
const is = require('is');
const render = require('ms-mailer-templates');

/**
 * Promise wrapper over smtp transport
 * @param  {Object} transport
 * @param  {Object} email
 * @return {Promise}
 */
module.exports = function sendMail(transport, email, ctx) {
  const template = is.string(email)
    ? Promise.props({
      ...ctx.nodemailer,
      html: render(email, ctx.template),
    })
    : Promise.resolve(email);

  return template
    .then(renderedTemplate => Promise.fromNode((next) => {
      transport.sendMail(renderedTemplate, next);
    }));
};
