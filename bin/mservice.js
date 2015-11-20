#!/usr/bin/env node

// accepts conf through .env file
// suitable for configuring this in the docker env
var configuration = require('ms-amqp-conf');
var bunyan = require('bunyan');

var dir;
if (process.env.NODE_ENV === 'production') {
  dir = '../lib';
} else {
  dir = '../src';
  require('../test/babelhook.js');
}

var streams = [{
  level: 'trace',
  type: 'raw',
  stream: new bunyan.RingBuffer({ limit: 100 }),
}];
if (configuration.logger) {
  streams.push({
    stream: process.stdout,
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  });
}

var Service = require(dir);
var service = new Service(configuration);
var logger = bunyan.createLogger({
  name: service._config.name || 'ms-mailer',
  streams: streams,
});
service.on('log', function writeLogs(namespace, message) {
  if (message) {
    logger.info({ namespace }, message);
  } else {
    logger.info(namespace);
  }
});

service.connect()
  .then(function serviceStarted() {
    logger.info('service started');
  })
  .catch(function serviceCrashed(err) {
    logger.fatal('service crashed', err);
    setImmediate(function escapeTryCatch() {
      throw err;
    });
  });
