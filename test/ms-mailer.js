const Promise = require('bluebird');
const chai = require('chai');
const expect = chai.expect;
const { SMTPServer } = require('smtp-server');
const AMQPTransport = require('ms-amqp-transport');

describe('MS Mailer', function AMQPTransportTestSuite() {
  this.timeout(10000);

  const configuration = { connection: {} };
  if (process.env.NODE_ENV === 'docker') {
    configuration.connection.host = process.env.RABBITMQ_PORT_5672_TCP_ADDR;
    configuration.connection.port = process.env.RABBITMQ_PORT_5672_TCP_PORT;
  }

  function getAMQPConnection() {
    return AMQPTransport.connect(configuration)
      .disposer((amqp) => {
        return amqp.close();
      });
  }

  const Mailer = require('../src');
  const VALID_PREDEFINED_ACCOUNTS = {
    'test-example': {
      host: 'localhost',
      port: 8465,
      secure: false,
      auth: {
        user: 'test@example.com',
        pass: '123',
      },
    },
  };
  const TEST_EMAIL = {
    to: 'v@makeomatic.ru',
    html: 'very important stuff',
    from: 'test mailer <v@example.com>',
  };
  let mailer;

  beforeEach('init ssl service', function startSMTPServer(done) {
    // This example starts a SMTP server using TLS with your own certificate and key
    this.server = new SMTPServer({
      hideSTARTTLS: true,
      secure: false,
      closeTimeout: 2000,
      logger: process.env.NODE_ENV === 'development' ? null : false,
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

  it('successfully starts mailer', function test() {
    mailer = new Mailer({ amqp: configuration });
    return mailer.connect()
      .reflect()
      .then(result => {
        expect(result.isFulfilled()).to.be.eq(true);
      });
  });

  it('fails to start mailer on invalid configuration', function test() {
    expect(() => {
      return new Mailer({
        prefix: false,
        amqp: configuration,
      });
    }).to.throw({ name: 'ValidationError'});
  });

  it('is able to setup transports for a predefined account', function test() {
    mailer = new Mailer({
      accounts: VALID_PREDEFINED_ACCOUNTS,
      amqp: configuration,
    });

    return mailer
      .connect()
      .then(() => {
        expect(mailer._transports).to.have.ownProperty('test-example');
      });
  });

  it('is able to send a message via predefined account', function test() {
    mailer = new Mailer({
      accounts: VALID_PREDEFINED_ACCOUNTS,
      amqp: configuration,
    });
    return mailer.connect()
      .then(() => {
        return mailer.router(
          {
            account: 'test-example',
            email: TEST_EMAIL,
          },
          {
            routingKey: 'predefined',
          },
          {
            ack: function noop() {},
            reject: function noop() {},
          }
        );
      })
      .then((msg) => {
        expect(msg.response).to.be.eq('250 OK: message queued');
      });
  });

  it('is able to send a message via adhoc account', function test() {
    mailer = new Mailer({ amqp: configuration });
    return mailer
      .connect()
      .then(() => {
        return mailer.router(
          {
            account: VALID_PREDEFINED_ACCOUNTS['test-example'],
            email: TEST_EMAIL,
          },
          {
            routingKey: 'adhoc',
          },
          {
            ack: function noop() {},
          }
        );
      })
      .then((msg) => {
        expect(msg.response).to.be.eq('250 OK: message queued');
      });
  });

  it('is able to send a message via amqp/predefined', function test() {
    mailer = new Mailer({
      accounts: VALID_PREDEFINED_ACCOUNTS,
      amqp: configuration,
    });
    return mailer.connect().then(() => {
      return Promise.using(getAMQPConnection(), (amqp) => {
        return amqp.publishAndWait('mailer.predefined', {
          account: 'test-example',
          email: TEST_EMAIL,
        });
      })
      .then((msg) => {
        expect(msg.response).to.be.eq('250 OK: message queued');
      });
    });
  });

  it('is able to send a message via amqp/adhoc', function test() {
    mailer = new Mailer({ amqp: configuration });
    return mailer.connect().then(() => {
      return Promise.using(getAMQPConnection(), (amqp) => {
        return amqp.publishAndWait('mailer.adhoc', {
          account: VALID_PREDEFINED_ACCOUNTS['test-example'],
          email: TEST_EMAIL,
        });
      })
      .then((msg) => {
        expect(msg.response).to.be.eq('250 OK: message queued');
      });
    });
  });

  afterEach('closes mailer', function closesMailer() {
    return mailer.close()
      .catchReturn({ name: 'NotPermittedError' }, true);
  });

  afterEach('close smtp service', function stopSMTPServer(done) {
    this.server.close(done);
  });
});
