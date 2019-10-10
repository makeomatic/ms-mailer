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
    enabled: ['postRequest', 'preRequest', 'preResponse', 'postResponse'],
    register: [
      routerExtension('validate/schemaLessAction'),
      routerExtension('audit/log')(),
      routerExtension('audit/metrics')(),
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
    prefix: '',
  },
};


// https://www.npmjs.com/package/html-to-text
exports.htmlToText = {
  wordwrap: 140,
};

exports.plugins = ['validator', 'logger', 'router', 'amqp', 'http', 'prometheus'];

exports.validator = {
  schemas: [path.resolve(__dirname, '../../schemas')],
};
