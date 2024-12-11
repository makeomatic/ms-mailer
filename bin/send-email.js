#!/usr/bin/env node

/* eslint-disable no-console */

const { argv } = require('yargs')
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
  .option('attachment', {
    describe: 'attachment',
    array: true,
    coerce: (collection) => collection.map((arg) => {
      let resp;
      try {
        resp = JSON.parse(Buffer.from(arg, 'base64'));
      } catch (e) {
        resp = { path: arg };
      }
      return resp;
    }),
  })
  .help('h');

// these are basic options that we want to send
const { connect } = require('@microfleet/transport-amqp');
const omit = require('lodash/omit');
const pick = require('lodash/pick');
const getStore = require('../lib/config');

async function main() {
  const store = await getStore({ env: process.env.NODE_ENV });
  const config = store.get('/');

  const amqpConfig = omit(config.amqp.transport, ['queue', 'listen', 'neck', 'onComplete', 'bindPersistantQueueToHeadersExchange']);
  const { prefix } = config.router.routes;

  // sends email
  async function sendEmail(amqp) {
    const route = `${prefix}.predefined`;
    const basics = pick(argv, ['from', 'to', 'cc', 'bcc', 'subject']);
    const message = {
      account: argv.account,
      email: { ...basics },
    };

    message.email[argv.type] = argv.body;

    // add attachments, ensure they are local
    if (Array.isArray(argv.attachment) && argv.attachment.length > 0) {
      message.email.attachments = argv.attachment;
    }

    const rsp = await amqp.publishAndWait(route, message, { timeout: 60000 });

    console.log(rsp.response);
  }

  let transport;
  try {
    transport = await connect(amqpConfig);
    await sendEmail(transport);
  } catch (err) {
    console.error(err);
  } finally {
    if (transport) transport.close();
  }
}

main();
