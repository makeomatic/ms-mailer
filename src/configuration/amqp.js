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
      // private queues are bound to amq.headers
      // so we bind to amq.match which is another default
      // headers exchange - that way x-reply-to won't overlap
      exchange: 'amq.match',
    },
  },
  router: {
    enabled: true,
  },
};
