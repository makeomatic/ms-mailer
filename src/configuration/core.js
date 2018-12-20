const { ActionTransport, routerExtension } = require('@microfleet/core');
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

exports.router = {
  routes: {
    directory: path.join(__dirname, '../actions'),
    prefix: 'mailer',
    setTransportsAsDefault: true,
    transports: [ActionTransport.amqp],
  },
  extensions: {
    enabled: ['postRequest', 'preRequest', 'preResponse'],
    register: [
      routerExtension('validate/schemaLessAction'),
      routerExtension('audit/log'),
    ],
  },
};

// https://www.npmjs.com/package/html-to-text
exports.htmlToText = {
  wordwrap: 140,
};

exports.plugins = ['validator', 'logger', 'router', 'amqp'];

exports.validator = ['../schemas'];
