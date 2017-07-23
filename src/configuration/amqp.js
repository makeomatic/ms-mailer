const onComplete = require('../onComplete');

/**
 * AMQP Plugin Configuration.
 * @type {Object}
 */
exports.amqp = {
  transport: {
    queue: 'ms-mailer',
    neck: 100,
    onComplete,
    bindPersistantQueueToHeadersExchange: true,
    headersExchange: {
      exchange: 'amq.headers',
    },
  },
  router: {
    enabled: true,
  },
};
