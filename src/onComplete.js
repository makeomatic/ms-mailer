const Promise = require('bluebird');
const testError = require('./utils/testError');

// quick way to check if action is adhoc
const adhocregex = /\.adhoc$/;
const isAdHoc = actionName => adhocregex.test(actionName);

/**
 * Accepts/rejects messages
 */
module.exports = function ack(err, data, actionName, actions) {
  if (!err) {
    this.log.info('sent message via %s, ack', actionName);
    actions.ack();
    return data;
  }

  if (err.name === 'ValidationError' || err.name === 'NotFoundError' || isAdHoc(actionName) || testError(err.message)) {
    actions.reject();
    this.log.fatal('invalid configuration for email, rejecting', err);
    return Promise.reject(err);
  }

  // assume that predefined accounts must not fail - credentials are correct
  this.log.error('Error performing operation %s. Scheduling retry', actionName, err);
  actions.retry();
  return Promise.reject(err);
};
