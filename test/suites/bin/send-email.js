/* eslint-disable no-console */

const assert = require('assert');
const path = require('path');
const spawn = require('child_process').execFile;
const smtp = require('../../helpers');

describe('binary: send-email', function suite() {
  const binaryPath = path.resolve(__dirname, '../../../bin/send-email.js');

  function exec(next, args = []) {
    spawn(binaryPath, ['--account', 'test-example', ...args], {
      timeout: 15000,
      env: Object.assign({
        MS_MAILER__AMQP__TRANSPORT__CONNECTION__HOST: 'rabbitmq',
        MS_MAILER__AMQP__TRANSPORT__CONNECTION__PORT: 5672,
      }, process.env),
      cwd: process.cwd(),
    }, (err, stdout, stderr) => {
      if (err) {
        return next(err);
      }

      assert.equal(stderr, '');
      return next(null, stdout.split('\n').slice(0, -1));
    });
  }

  // SMTP
  beforeEach('init smtp service', smtp.start);
  afterEach('close smtp service', smtp.stop);

  // ms-mailer
  before('start mailer', smtp.mailerStart);
  after('cleanup mailer', smtp.mailerStop);

  const basicArgs = [
    '--from',
    'msmailer support <msmailer@example.com>',
    '--to',
    'msmailer robot <msmailer-robot@example.com>',
    '--to',
    'msmailer robot 2 <msmailer-robot-2@example.com>',
    '--bcc',
    'youdontseeme <youdontseeme@example.com>',
    '--subject',
    'very much a test email',
  ];

  it('is able to send an email with text-only content', function test(next) {
    const args = [
      ...basicArgs,
      '--body',
      'hey friendly dude',
    ];

    exec((err, lines) => {
      if (err) {
        return next(err);
      }

      assert.equal(lines[1], '250 OK: message queued');
      return next();

      // assert stuff
    }, args);
  });

  it('is able to send email with html content', function test(next) {
    const args = [
      ...basicArgs,
      '--type',
      'html',
      '--body',
      '<strong>very nice html</strong>',
    ];

    exec((err, lines) => {
      if (err) {
        return next(err);
      }

      assert.equal(lines[1], '250 OK: message queued');
      return next();

      // assert stuff
    }, args);
  });
});
