#!/usr/bin/env node

let dir;
try {
  require('babel-register');
  dir = '../src';
} catch (e) {
  dir = '../lib';
}

const configuration = require('ms-conf');

// eslint-disable-next-line import/no-dynamic-require
const Service = require(dir);

const service = new Service(configuration.get('/'));
service.connect()
  .then(function serviceStarted() {
    return service.log.info('service started');
  })
  .catch(function serviceCrashed(err) {
    service.log.fatal('service crashed', err);
    setImmediate(function escapeTryCatch() {
      throw err;
    });
  });
