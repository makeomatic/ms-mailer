const Promise = require('bluebird');
const extend = require('lodash/extend');
const pick = require('lodash/pick');
const testError = require('./utils/testError');
const calculatePriority = require('./utils/calculatePriority');

// quick way to check if action is adhoc
const adhocregex = /\.adhoc$/;
const isAdHoc = actionName => adhocregex.test(actionName);

/**
 * Accepts/rejects messages
 */
module.exports = function ack(err, data, actionName, message) {
  if (!err) {
    this.log.info('sent message via %s, ack', actionName);
    message.ack();
    return data;
  }

  // check for current try
  const retryCount = (message.properties.headers['x-retry-count'] || 0) + 1;

  // quite complex, basicaly verifies that these are not logic errors
  // this is not an ad-hoc transport
  // this is not an smtp error (bad auth, etc)
  // and that if there were no other problems - that we haven't exceeded max retries
  if (
    err.name === 'ValidationError' ||
    err.name === 'NotFoundError' ||
    isAdHoc(actionName) ||
    testError(err.message) ||
    retryCount > this.config.retry.maxRetries
  ) {
    // we must ack, otherwise message would be returned to sender with reject
    // instead of promise.reject
    message.ack();
    this.log.fatal('Was not able to send an email', err);
    return Promise.reject(err);
  }

  // assume that predefined accounts must not fail - credentials are correct
  this.log.error('Error performing operation %s. Scheduling retry', actionName, err);

  // retry message options
  const expiration = this.backoff.get('qos', retryCount);
  const retryMessageOptions = {
    skipSerialize: true,
    confirm: true,
    expiration: expiration.toString(),
    priority: calculatePriority(expiration, this.config.retry.max),
    headers: {
      'x-routing-key': message.properties.headers['x-routing-key'] || message.routingKey,
      'x-retry-count': retryCount,
    },
  };

  // duplicate so that retry messages can route back during expiration time
  extend(retryMessageOptions, pick(message.properties, ['replyTo', 'correlationId']));

  return this.amqp
    .send(this.retryQueue, message.raw, retryMessageOptions)
    .catch((e) => {
      this.log.error('Failed to queue retried message', e);
      message.retry();
      return Promise.reject(err);
    })
    .then(() => {
      message.ack();

      // enrich error
      err.scheduledRetry = true;
      err.retryAttempt = retryCount;

      // reset correlation id
      // that way response will actually come, but won't be routed in the private router
      // of the sender
      message.properties.correlationId = '00000000-0000-0000-0000-000000000000';

      // reject with an error, yet a retry will still occur
      return Promise.reject(err);
    });
};
