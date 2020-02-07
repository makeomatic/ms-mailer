const errors = [
  'Exceed Sending Limit',
  'Unconfigured Sending Domain',
].map((e) => new RegExp(e.toLowerCase()));

/**
 * Test error returned from third-party
 * @param  {String} message
 * @return {Boolean}
 */
module.exports = function testError(message) {
  const lowerCased = message.toLowerCase();

  for (const error of errors) {
    if (error.test(lowerCased)) return true;
  }

  return false;
};
