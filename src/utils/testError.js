const errors = [
  'Exceed Sending Limit',
  'Unconfigured Sending Domain',
].map(e => new RegExp(e.toLowerCase()));

/**
 * Test error returned from third-party
 * @param  {String} message
 * @return {Boolean}
 */
module.exports = function testError(message) {
  for (let i = 0; i < errors.length; i += 1) {
    if (errors[i].test(message.toLowerCase())) return true;
  }

  return false;
};
