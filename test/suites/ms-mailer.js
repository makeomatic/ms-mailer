const Promise = require('bluebird');
const assert = require('assert');
const render = require('ms-mailer-templates');
const { inspectPromise } = require('@makeomatic/deploy');
const smtp = require('../helpers');

describe('MS Mailer', function AMQPTransportTestSuite() {
  const Mailer = require('../../src');
  const config = require('../../lib/config').get('/', { env: process.env.NODE_ENV });

  beforeEach('init smtp service', smtp.start);
  afterEach('close smtp service', smtp.stop);

  describe('various mailer configurations', function configSuite() {
    let mailer;

    it('successfully starts mailer', async function test() {
      mailer = new Mailer({ amqp: smtp.AMQPConfiguration });
      return mailer.connect();
    });

    it('fails to start mailer on invalid configuration', function test() {
      mailer = null;
      assert.throws(
        () => new Mailer({
          amqp: { ...smtp.AMQPConfiguration, prefix: false },
        }),
        'AssertionError'
      );
    });

    it('is able to setup transports for a predefined account', function test() {
      mailer = new Mailer({
        accounts: smtp.VALID_PREDEFINED_ACCOUNTS,
        amqp: smtp.AMQPConfiguration,
      });

      return mailer
        .connect()
        .then(() => {
          assert.equal(mailer._transports.has('test-example'), true);
          return null;
        });
    });

    afterEach(async function clean() {
      return mailer && mailer.close();
    });
  });

  describe('connected service', function suite() {
    before('start mailer', smtp.mailerStart);

    it('is able to send a message via predefined account', function test() {
      return Promise.using(smtp.getAMQPConnection(), amqp => amqp
        .publishAndWait('mailer.predefined', {
          account: 'test-example',
          email: smtp.TEST_EMAIL,
        })
        .then((msg) => {
          assert.equal(msg.response, '250 OK: message queued');
          return null;
        }));
    });

    it('is able to send a message via amqp/adhoc', function test() {
      return Promise.using(smtp.getAMQPConnection(), amqp => amqp
        .publishAndWait('mailer.adhoc', {
          account: smtp.VALID_PREDEFINED_ACCOUNTS['test-example'],
          email: smtp.TEST_EMAIL,
        })
        .then((msg) => {
          assert.equal(msg.response, '250 OK: message queued');
          return null;
        }));
    });

    it('is able to send email with inlined base64 images', function test() {
      return render('cpst-activate', {})
        .then(template => Promise.using(smtp.getAMQPConnection(), amqp => amqp
          .publishAndWait('mailer.adhoc', {
            account: smtp.VALID_PREDEFINED_ACCOUNTS['test-example'],
            email: {
              to: 'v@makeomatic.ru',
              html: template,
              from: 'test mailer <v@example.com>',
            },
          })
          .then((msg) => {
            assert.equal(msg.response, '250 OK: message queued');
            return null;
          })));
    });

    it('is able to send email with string tpl & ctx', function test() {
      return Promise.using(smtp.getAMQPConnection(), amqp => amqp
        .publishAndWait('mailer.adhoc', {
          account: smtp.VALID_PREDEFINED_ACCOUNTS['test-example'],
          email: 'cpst-activate',
          ctx: {
            nodemailer: {
              to: 'v@makeomatic.ru',
              from: 'test mailer <v@example.com>',
            },
            template: {
              random: true,
            },
          },
        })
        .then((msg) => {
          assert.equal(msg.response, '250 OK: message queued');
          return null;
        }));
    });

    it('test retry with delay', function test() {
      return Promise.using(smtp.getAMQPConnection(), amqp => amqp
        .publishAndWait('mailer.predefined', {
          account: 'test-example',
          email: 'cpst-activate',
          ctx: {
            nodemailer: {
              to: 'v+retry@makeomatic.ru',
              from: 'test mailer <v@example.com>',
            },
            template: {
              random: true,
            },
          },
        })
        .then((msg) => {
          assert.equal(msg.response, '250 OK: message queued');
          return null;
        }));
    });

    it('is able to reject on max retries', function test() {
      return Promise.using(smtp.getAMQPConnection(), amqp => amqp
        .publishAndWait('mailer.predefined', {
          account: 'test-example',
          email: 'cpst-activate',
          ctx: {
            nodemailer: {
              to: 'v+retry-reject@makeomatic.ru',
              from: 'test mailer <v@example.com>',
            },
            template: {
              random: true,
            },
          },
        })
        .reflect()
        .then(inspectPromise(false))
        .then((err) => {
          assert.equal(err.name, 'Error');
          assert.equal(err.retryAttempt, config.amqp.retry.maxRetries);
          return null;
        }));
    });

    after('cleanup mailer', smtp.mailerStop);
  });
});
