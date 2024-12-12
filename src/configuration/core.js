const { Extensions } = require('@microfleet/plugin-router');
const path = require('path');

exports.name = 'mailer';

exports.debug = process.env.NODE_ENV !== 'production';

exports.logger = {
  defaultLogger: true,
  debug: process.env.NODE_ENV !== 'production',
};

exports.predefinedLimits = {
  maxConnections: 20,
  maxMessages: Number.MAX_SAFE_INTEGER,
};

/**
 * @type {import('@microfleet/plugin-router').RouterPluginConfig}
 */
exports.router = {
  routes: {
    directory: path.join(__dirname, '../actions'),
    prefix: 'mailer',
    enabledGenericActions: ['health'],
  },
  extensions: {
    register: [
      Extensions.auditLog(),
    ],
  },
};

exports.hapi = {
  server: {
    port: 3000,
  },
};

exports.routerHapi = {
  prefix: '',
};

// https://www.npmjs.com/package/html-to-text
exports.htmlToText = {
  wordwrap: 140,
};

exports.plugins = [
  'validator',
  'logger',
  'router',
  'amqp',
  'router-amqp',
  'hapi',
  'router-hapi',
  'prometheus',
];

exports.validator = {
  schemas: [path.resolve(__dirname, '../../schemas')],
};
