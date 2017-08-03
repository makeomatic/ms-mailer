const { Error, ValidationError, NotFoundError } = require('common-errors');
const testError = require('../utils/testError');

// quick way to check if action is adhoc
const adhocregex = /\.adhoc$/;
const isAdHoc = actionName => adhocregex.test(actionName);

/**
 * AMQP Plugin Configuration.
 * @type {Object}
 */
exports.amqp = {
  transport: {
    queue: 'ms-mailer',
    neck: 100,
    bindPersistantQueueToHeadersExchange: true,
  },
  router: {
    enabled: true,
  },
  retry: {
    min: 1000,
    factor: 1.2,
    max: {
      $filter: 'env',
      production: 60 * 60 * 1000 * 5,
      default: 5000,
    },
    maxRetries: {
      $filter: 'env',
      production: 100,
      default: 3,
    },
    predicate(err, actionName) {
      switch (err.constructor) {
        case Error:
        case ValidationError:
        case NotFoundError:
          return true;

        default:
          return isAdHoc(actionName) || testError(err.message);
      }
    },
  },
};
