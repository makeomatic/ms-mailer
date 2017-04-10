const Promise = require('bluebird');
const chai = require('chai');
const { SMTPServer } = require('smtp-server');
const AMQPTransport = require('ms-amqp-transport');
const render = require('ms-mailer-templates');

const expect = chai.expect;

describe('MS Mailer', function AMQPTransportTestSuite() {
  const Mailer = require('../../src');

  const configuration = {
    transport: {
      debug: true,
      connection: {
        host: 'rabbitmq',
        port: 5672,
      },
    },
  };

  function getAMQPConnection() {
    return AMQPTransport
      .connect(configuration.transport)
      .disposer(amqp => amqp.close());
  }

  const VALID_PREDEFINED_ACCOUNTS = {
    'test-example': {
      host: 'localhost',
      port: 8465,
      secure: false,
      auth: {
        user: 'test@example.com',
        pass: '123',
      },
      debug: true,
      logger: true,
    },
    mailgun: {
      transport: 'mailgun',
      auth: {
        api_key: 'useless',
        domain: 'example.com',
      },
    },
    sparkpost: {
      transport: 'sparkpost',
      sparkPostApiKey: 'invalidkey',
    },
  };
  const TEST_EMAIL = {
    to: 'v@makeomatic.ru',
    html: 'very important stuff',
    from: 'test mailer <v@example.com>',
  };

  beforeEach('init ssl service', function startSMTPServer(done) {
    // This example starts a SMTP server using TLS with your own certificate and key
    this.server = new SMTPServer({
      hideSTARTTLS: true,
      secure: false,
      closeTimeout: 2000,
      logger: true,
      authMethods: ['PLAIN', 'LOGIN', 'XOAUTH2'],
      onAuth: function handleAuth(auth, session, callback) {
        switch (auth.method) {
          case 'XOAUTH2':
            return callback(new Error('Invalid username or password'));

          default:
            if (auth.username === 'test@example.com' && auth.password === '123') {
              return callback(null, { user: 'test@example.com' });
            }

            return callback(new Error('Invalid username or password'));
        }
      },
    });

    this.server.listen(8465, '0.0.0.0', done);
  });

  describe('various mailer configurations', function configSuite() {
    let mailer;

    it('successfully starts mailer', function test() {
      mailer = new Mailer({ amqp: configuration });
      return mailer.connect()
        .reflect()
        .then((result) => {
          expect(result.isFulfilled()).to.be.eq(true);
          return null;
        });
    });

    it('fails to start mailer on invalid configuration', function test() {
      expect(() =>
        new Mailer({
          amqp: { ...configuration, prefix: false },
        })
      ).to.throw({ name: 'ValidationError' });
    });

    it('is able to setup transports for a predefined account', function test() {
      mailer = new Mailer({
        accounts: VALID_PREDEFINED_ACCOUNTS,
        amqp: configuration,
      });

      return mailer
        .connect()
        .then(() => {
          expect(mailer._transports.has('test-example')).to.be.eq(true);
          return null;
        });
    });

    afterEach(function clean() {
      return mailer && mailer.close().reflect();
    });
  });

  describe('connected service', function suite() {
    before(function pretest() {
      this.mailer = new Mailer({
        logger: {
          defaultLogger: true,
          debug: true,
        },
        debug: true,
        accounts: VALID_PREDEFINED_ACCOUNTS,
        amqp: configuration,
      });
      return this.mailer.connect();
    });

    it('is able to send a message via predefined account', function test() {
      return Promise.using(getAMQPConnection(), amqp =>
        amqp.publishAndWait('mailer.predefined', {
          account: 'test-example',
          email: TEST_EMAIL,
        })
        .then((msg) => {
          expect(msg.response).to.be.eq('250 OK: message queued');
          return null;
        })
      );
    });

    it('is able to send a message via amqp/adhoc', function test() {
      return Promise.using(getAMQPConnection(), amqp =>
        amqp.publishAndWait('mailer.adhoc', {
          account: VALID_PREDEFINED_ACCOUNTS['test-example'],
          email: TEST_EMAIL,
        })
        .then((msg) => {
          expect(msg.response).to.be.eq('250 OK: message queued');
          return null;
        })
      );
    });

    it('is able to send email with inlined base64 images', function test() {
      return render('cappasity-activate', {})
        .then(template =>
          Promise.using(getAMQPConnection(), amqp =>
            amqp.publishAndWait('mailer.adhoc', {
              account: VALID_PREDEFINED_ACCOUNTS['test-example'],
              email: {
                to: 'v@makeomatic.ru',
                html: template,
                from: 'test mailer <v@example.com>',
              },
            })
            .then((msg) => {
              expect(msg.response).to.be.eq('250 OK: message queued');
              return null;
            })
          )
        );
    });

    it('is able to send email with string tpl & ctx', function test() {
      return Promise.using(getAMQPConnection(), amqp =>
        amqp.publishAndWait('mailer.adhoc', {
          account: VALID_PREDEFINED_ACCOUNTS['test-example'],
          email: 'cappasity-activate',
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
          expect(msg.response).to.be.eq('250 OK: message queued');
          return null;
        })
      );
    });

    after(function cleanup() {
      return this.mailer.close().finally(() => {
        this.mailer = null;
      });
    });
  });

  afterEach('close smtp service', function stopSMTPServer(done) {
    this.server.close(done);
  });
});
