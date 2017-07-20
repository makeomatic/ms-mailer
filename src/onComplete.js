const Promise = require('bluebird');
const testError = require('./utils/testError');
const calculatePriority = require('./utils/calculatePriority');

// quick way to check if action is adhoc
const adhocregex = /\.adhoc$/;
const isAdHoc = actionName => adhocregex.test(actionName);
const tries = 10;

/**
 * Accepts/rejects messages
 */
module.exports = function ack(err, data, actionName, message) {
  this.log.info('tester message: ', message);
  if (!err) {
    this.log.info('sent message via %s, ack', actionName);
    message.ack();
    return data;
  }

  let retryCount = message.properties['x-retry-count'];
  if (!retryCount) retryCount = 0;
  retryCount += 1;

  if (err.name === 'ValidationError' || err.name === 'NotFoundError' || isAdHoc(actionName) || testError(err.message) || retryCount === tries) {
    message.reject();
    this.log.fatal('invalid configuration for email, rejecting', err);
    return Promise.reject(err);
  }

  // assume that predefined accounts must not fail - credentials are correct
  this.log.error('Error performing operation %s. Scheduling retry', actionName, err);

  this.amqp.send(
    'x-delay-ms-mailer',
    message,
    {
      confirm: true,
      priority: calculatePriority(message.properties.expiration),
      expiration: message.properties.expiration,
      headers: {
        'x-routing-key': message.properties.routingKey,
        'x-retry-count': retryCount,
      },
    }
  );

  message.ack();
  return Promise.reject(err);
};
