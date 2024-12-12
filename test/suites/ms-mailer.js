const assert = require('assert');
const render = require('ms-mailer-templates');
const smtp = require('../helpers');

describe('MS Mailer', function AMQPTransportTestSuite() {
  const initMailer = require('../../src');
  const getStore = require('../../lib/config');

  let config;
  before(async () => {
    const store = await getStore({ env: process.env.NODE_ENV });
    config = store.get('/');
  });

  beforeEach('init smtp service', smtp.start);
  afterEach('close smtp service', smtp.stop);

  describe('various mailer configurations', function configSuite() {
    let mailer;

    it('successfully starts mailer', async function test() {
      mailer = await initMailer({ amqp: smtp.AMQPConfiguration });
      await mailer.connect();
    });

    it('fails to start mailer on invalid configuration', function test() {
      mailer = null;
      assert.rejects(
        initMailer({
          amqp: { ...smtp.AMQPConfiguration, prefix: false },
        }),
        'AssertionError'
      );
    });

    it('is able to setup transports for a predefined account', async function test() {
      mailer = await initMailer({
        accounts: smtp.VALID_PREDEFINED_ACCOUNTS,
        amqp: smtp.AMQPConfiguration,
      });

      await mailer.connect();
      assert.equal(mailer._transports.has('test-example'), true);
    });

    it('is able to setup transports with options', async function test() {
      mailer = await initMailer({
        accounts: smtp.TEST_SPARKPOST_OPTIONS,
        amqp: smtp.AMQPConfiguration,
      });

      await mailer.connect();
      assert.equal(
        mailer._transports.get('sparkpost').transporter.options.transactional,
        true
      );
    });

    afterEach(async function clean() {
      if (mailer) await mailer.close();
    });
  });

  describe('connected service', function suite() {
    before('start mailer', smtp.mailerStart);

    it('is able to send a message via predefined account', async function test() {
      const amqp = await smtp.getAMQPConnection();
      try {
        const msg = await amqp.publishAndWait('mailer.predefined', {
          account: 'test-example',
          email: smtp.TEST_EMAIL,
        });
        assert.equal(msg.response, '250 OK: message queued');
      } finally {
        await amqp.close();
      }
    });

    it('is able to send a message via amqp/adhoc', async function test() {
      const amqp = await smtp.getAMQPConnection();
      try {
        const msg = await amqp.publishAndWait('mailer.adhoc', {
          account: smtp.VALID_PREDEFINED_ACCOUNTS['test-example'],
          email: smtp.TEST_EMAIL,
        });
        assert.equal(msg.response, '250 OK: message queued');
      } finally {
        await amqp.close();
      }
    });

    it('is able to send email with inlined base64 images', async function test() {
      const template = await render('reset', {});
      const amqp = await smtp.getAMQPConnection();
      try {
        const msg = await amqp.publishAndWait('mailer.adhoc', {
          account: smtp.VALID_PREDEFINED_ACCOUNTS['test-example'],
          email: {
            to: 'v@makeomatic.ru',
            html: template,
            from: 'test mailer <v@example.com>',
          },
        });
        assert.equal(msg.response, '250 OK: message queued');
      } finally {
        await amqp.close();
      }
    });

    it('is able to send email with string tpl & ctx', async function test() {
      const amqp = await smtp.getAMQPConnection();
      try {
        const msg = await amqp.publishAndWait('mailer.adhoc', {
          account: smtp.VALID_PREDEFINED_ACCOUNTS['test-example'],
          email: 'reset',
          ctx: {
            nodemailer: {
              to: 'v@makeomatic.ru',
              from: 'test mailer <v@example.com>',
            },
            template: {
              random: true,
            },
          },
        });
        assert.equal(msg.response, '250 OK: message queued');
      } finally {
        await amqp.close();
      }
    });

    it('test retry with delay', async function test() {
      const amqp = await smtp.getAMQPConnection();
      try {
        const msg = await amqp.publishAndWait('mailer.predefined', {
          account: 'test-example',
          email: 'reset',
          ctx: {
            nodemailer: {
              to: 'v+retry@makeomatic.ru',
              from: 'test mailer <v@example.com>',
            },
            template: {
              random: true,
            },
          },
        });
        assert.equal(msg.response, '250 OK: message queued');
      } finally {
        await amqp.close();
      }
    });

    it('is able to reject on max retries', async function test() {
      const amqp = await smtp.getAMQPConnection();
      try {
        await assert.rejects(async () => {
          await amqp.publishAndWait('mailer.predefined', {
            account: 'test-example',
            email: 'reset',
            ctx: {
              nodemailer: {
                to: 'v+retry-reject@makeomatic.ru',
                from: 'test mailer <v@example.com>',
              },
              template: {
                random: true,
              },
            },
          });
        }, (err) => {
          assert.equal(err.name, 'Error');
          assert.equal(err.retryAttempt, config.routerAmqp.retry.maxRetries);
          return true;
        });
      } finally {
        await amqp.close();
      }
    });

    after('cleanup mailer', smtp.mailerStop);
  });
});
