#!/usr/bin/env node

// accepts conf through .env file
// suitable for configuring this in the docker env
var configuration = require('ms-amqp-conf');

var dir;
if (process.env.NODE_ENV === 'production') {
  dir = '../lib';
} else {
  dir = '../src';
  require('../test/babelhook.js');
}

var Service = require(dir);
var service = new Service(configuration);
service.connect()
  .then(function serviceStarted() {
    service.log.info('service started');
  })
  .catch(function serviceCrashed(err) {
    service.log.fatal('service crashed', err);
    setImmediate(function escapeTryCatch() {
      throw err;
    });
  });
