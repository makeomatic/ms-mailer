const Promise = require('bluebird');

/**
 * Accepts/rejects messages
 */
module.exports = function ack(err, data, actionName, actions) {
  if (!err) {
    actions.ack();
    return data;
  }

  if (err.name === 'ValidationError' || actionName === 'adhoc') {
    actions.reject();
    return Promise.reject(err);
  }

  // assume that predefined accounts must not fail - credentials are correct
  this.log.error('error performing operation %s. Scheduling retry', actionName, err);
  actions.retry();
  return Promise.reject(err);
};
