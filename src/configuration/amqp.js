const { ValidationError, NotFoundError } = require('common-errors');
const testError = require('../utils/testError');

// quick way to check if action is adhoc
const adhocregex = /\.adhoc$/;
const isAdHoc = (actionName) => adhocregex.test(actionName);

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
    enabled: true,
    factor: 1.2,
    min: {
      $filter: 'env',
      $default: 50,
      production: 1000,
    },
    max: {
      $filter: 'env',
      $default: 5000,
      production: 60 * 60 * 1000 * 5,
    },
    maxRetries: {
      $filter: 'env',
      $default: 3,
      production: 100,
    },
    predicate(err, actionName) {
      switch (err.constructor) {
        case ValidationError:
        case NotFoundError:
          return true;

        default:
          return isAdHoc(actionName) || testError(err.message);
      }
    },
  },
};
