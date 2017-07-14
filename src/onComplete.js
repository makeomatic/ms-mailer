const Promise = require('bluebird');
const testError = require('./utils/testError');

// quick way to check if action is adhoc
const adhocregex = /\.adhoc$/;
const isAdHoc = actionName => adhocregex.test(actionName);

/**
 * Accepts/rejects messages
 */
module.exports = function ack(err, data, actionName, actions, _tries = 10) {
  let tries = _tries;

  const retry = () => (
    new Promise((resolve, reject) => {
      if (!err) {
        this.log.info('sent message via %s, ack', actionName);
        actions.ack();
        return resolve(data);
      }

      if (err.name === 'ValidationError' || err.name === 'NotFoundError' || isAdHoc(actionName) || testError(err.message)) {
        return reject({ error: err, isFatal: true });
      }

      this.log.error('Error performing operation %s. Scheduling retry', actionName, err);
      return reject({ error: err });
    })
  )
  .catch((e) => {
    const { error } = e;

    if (e.isFatal) {
      actions.reject();
      this.log.fatal('invalid configuration for email, rejecting', error);
      return Promise.reject(error);
    }

    tries -= 1;

    if (tries === 0) {
      actions.reject();
      this.log.fatal('failed to send for %d times, rejecting', _tries, error);
      return Promise.reject(error);
    }

    return Promise.delay(10).then(() => {
      actions.retry();
      return retry();
    });
  });

  return retry();
};
