const maxExpiration = 3600 * 1000 * 5; // 5 hours

/**
 * Calculate priority based on message expiration time
 * @param  {Number} expiration
 * @return {Number}
 */
module.exports = function calculatePriority(expiration) {
  const newExpiration = Math.min(expiration, maxExpiration);
  return 100 - Math.floor((newExpiration / maxExpiration) * 100);
};
