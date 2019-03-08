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
    setTransportsAsDefault: false,
    transports: [ActionTransport.amqp, ActionTransport.http],
    enabledGenericActions: ['health'],
  },
  extensions: {
    enabled: ['postRequest', 'preRequest', 'preResponse'],
    register: [
      routerExtension('validate/schemaLessAction'),
      routerExtension('audit/log')(),
    ],
  },
};

exports.http = {
  server: {
    handler: 'hapi',
    port: 3000,
  },
  router: {
    enabled: true,
    prefix: 'mailer',
  },
};


// https://www.npmjs.com/package/html-to-text
exports.htmlToText = {
  wordwrap: 140,
};

exports.plugins = ['validator', 'logger', 'router', 'amqp', 'http', 'prometheus'];

exports.validator = ['../schemas'];
