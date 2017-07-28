const conf = require('ms-conf');
const path = require('path');

// default to "MS_MAILER"
process.env.NCONF_NAMESPACE = process.env.NCONF_NAMESPACE || 'MS_MAILER';

conf.prependDefaultConfiguration(path.resolve(__dirname, './configuration'));

module.exports = conf;
