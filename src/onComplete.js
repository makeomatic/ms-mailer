const Promise = require('bluebird');
const testError = require('./utils/testError');
const calculatePriority = require('./utils/calculatePriority');

// quick way to check if action is adhoc
const adhocregex = /\.adhoc$/;
const isAdHoc = actionName => adhocregex.test(actionName);

/**
 * Accepts/rejects messages
 */
module.exports = function ack(err, data, actionName, message) {
  const { properties } = message;
  const { headers } = properties;

  // reassign back so that response can be routed properly
  if (headers['x-correlation-id'] !== undefined) {
    properties.correlationId = headers['x-correlation-id'];
  }

  if (headers['x-reply-to'] !== undefined) {
    properties.replyTo = headers['x-reply-to'];
  }

  if (!err) {
    this.log.info('sent message via %s, ack', actionName);
    message.ack();
    return data;
  }

  // check for current try
  const retryCount = (headers['x-retry-count'] || 0) + 1;
  err.retryAttempt = retryCount;

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
      'x-routing-key': headers['x-routing-key'] || message.routingKey,
      'x-retry-count': retryCount,
    },
  };

  // deal with special routing properties
  const { replyTo, correlationId } = properties;

  // correlation id is used in routing stuff back from DLX, so we have to "hide" it
  // same with replyTo
  if (replyTo !== undefined) {
    // prefixed header so it doesn't match with the original queue
    retryMessageOptions.headers['x-reply-to'] = replyTo;
    // unroutable
    retryMessageOptions.replyTo = '00000000-0000-0000-0000-000000000000';
  }

  if (correlationId !== undefined) {
    // this is to ensure .reply will be sent back by @microfleet/transport-amqp
    retryMessageOptions.correlationId = '00000000-0000-0000-0000-000000000000';
    // this is to replace it back with this header in the router earlier
    retryMessageOptions.headers['x-correlation-id'] = correlationId;
  }

  return this.amqp
    .send(this.retryQueue, message.raw, retryMessageOptions)
    .catch((e) => {
      this.log.error('Failed to queue retried message', e);
      message.retry();
      return Promise.reject(err);
    })
    .then(() => {
      this.log.debug('queued retry message');
      message.ack();

      // enrich error
      err.scheduledRetry = true;

      // reset correlation id
      // that way response will actually come, but won't be routed in the private router
      // of the sender
      message.properties.correlationId = '00000000-0000-0000-0000-000000000000';

      // reject with an error, yet a retry will still occur
      return Promise.reject(err);
    });
};
