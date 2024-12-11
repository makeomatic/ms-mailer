// default to "MS_MAILER"
process.env.NCONF_NAMESPACE = process.env.NCONF_NAMESPACE || 'MS_MAILER';

const path = require('node:path');
const { Store } = require('ms-conf');

module.exports = async function prepareConfiguration(defaultOpts = {}) {
  const store = new Store({ defaultOpts });
  store.prependDefaultConfiguration(path.resolve(__dirname, './configuration'));
  await store.ready();

  return store;
};
