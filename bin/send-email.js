#!/usr/bin/env node

/* eslint-disable no-console */

const argv = require('yargs')
  .option('account', {
    describe: 'account to send this email from',
    demandOption: true,
  })
  .option('from', {
    describe: 'text to put into the from field',
    demandOption: true,
  })
  .option('to', {
    describe: 'emails to send to',
    array: true,
    demandOption: true,
  })
  .option('cc', {
    describe: 'cc of the emails',
    array: true,
  })
  .option('bcc', {
    describe: 'bcc of the emails',
    array: true,
  })
  .option('subject', {
    describe: 'subject of the email',
    demandOption: true,
  })
  .option('body', {
    describe: 'body of the message',
    demandOption: true,
  })
  .option('type', {
    describe: 'type of body that\'s been sent',
    choices: ['text', 'html'],
    default: 'text',
  })
  .help('h')
  .argv;

// these are basic options that we want to send
const Mailer = require('..');
const Promise = require('bluebird');
const AMQPTransport = require('ms-amqp-transport');
const configOverride = require('ms-conf').get('/');
const merge = require('lodash/merge');
const omit = require('lodash/omit');
const pick = require('lodash/pick');

// App level code
const config = merge({}, Mailer.defaultOpts, configOverride);
const amqpConfig = omit(config.amqp.transport, ['queue', 'listen', 'neck', 'onComplete']);
const prefix = config.router.routes.prefix;
const getTransport = () => {
  console.info('establishing connection to amqp with %j', amqpConfig);
  return AMQPTransport.connect(amqpConfig).disposer(amqp => amqp.close());
};

// sends email
const sendEmail = (amqp) => {
  const route = `${prefix}.predefined`;
  const basics = pick(argv, ['from', 'to', 'cc', 'bcc', 'subject']);
  const message = {
    account: argv.account,
    email: Object.assign({}, basics),
  };

  message.email[argv.type] = argv.body;

  return amqp
    .publishAndWait(route, message, { timeout: 60000 })
    .tap(rsp => console.log(rsp.response));
};

Promise
  .using(getTransport(), sendEmail)
  .done();
