/**
 * Calculate priority based on message expiration time.
 * Logic behind it is to give each expiration a certain priority bucket
 * based on the amount of priority levels in the RabbitMQ queue.
 * @param  {Number} expiration - current expiration (retry) time.
 * @param  {Number} maxExpiration - max possible expiration (retry) time.
 * @returns {Number} Queue Priority Level.
 */
module.exports = function calculatePriority(expiration, maxExpiration) {
  const newExpiration = Math.min(expiration, maxExpiration);
  return 100 - Math.floor((newExpiration / maxExpiration) * 100);
};
