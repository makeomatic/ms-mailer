const Mservice = require('@microfleet/core');
const path = require('path');

exports.debug = process.env.NODE_ENV !== 'production';

exports.logger = {
  defaultLogger: true,
  debug: process.env.NODE_ENV !== 'production',
};

exports.predefinedLimits = {
  maxConnections: 20,
  maxMessages: Infinity,
};

exports.retry = {
  min: 1000,
  max: 60 * 60 * 1000 * 5,
  factor: 1.2,
  maxRetries: 100,
};

exports.router = {
  routes: {
    directory: path.join(__dirname, '../actions'),
    prefix: 'mailer',
    setTransportsAsDefault: true,
    transports: [Mservice.ActionTransport.amqp],
  },
  extensions: {
    enabled: ['postRequest', 'preRequest', 'preResponse'],
    register: [
      Mservice.routerExtension('validate/schemaLessAction'),
      Mservice.routerExtension('audit/log'),
    ],
  },
};

// https://www.npmjs.com/package/html-to-text
exports.htmlToText = {
  wordwrap: 140,
};

exports.plugins = ['validator', 'logger', 'router', 'amqp'];

exports.validator = ['../schemas'];
