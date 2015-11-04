const chai = require('chai');
const expect = chai.expect;
const { SMTPServer } = require('smtp-server');

describe('MS Mailer', function AMQPTransportTestSuite() {
  this.timeout(10000);

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

  beforeEach('init ssl service', function startSMTPServer(done) {
    // This example starts a SMTP server using TLS with your own certificate and key
    this.server = new SMTPServer({
      hideSTARTTLS: true,
      secure: false,
      closeTimeout: 2000,
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

  it('successfully starts mailer', () => {
    this.mailer = new Mailer();
    return this.mailer.connect();
  });

  it('fails to start mailer on invalid configuration', () => {
    this.mailer = new Mailer({
      prefix: false,
    });
    return this.mailer.connect()
      .catchReturn({ name: 'ValidationError' }, true);
  });

  it('is able to setup transports for a predefined account', () => {
    this.mailer = new Mailer({
      accounts: VALID_PREDEFINED_ACCOUNTS,
    });
    return this.mailer.connect().then(() => {
      expect(this.mailer._transports).to.have.ownProperty('test-example');
    });
  });

  it('is able to send a message via predefined account', () => {
    this.mailer = new Mailer({
      accounts: VALID_PREDEFINED_ACCOUNTS,
    });
    return this.mailer
      .connect()
      .then(() => {
        return this.mailer.router(
          {
            account: 'test-example',
            email: {
              to: 'v@makeomatic.ru',
              html: 'very important stuff',
              from: 'test mailer <v@makeomatic.ru>',
            },
          },
          {
            routingKey: 'predefined',
          }
        );
      });
  });

  it('is able to send a message via adhoc account', () => {
    this.mailer = new Mailer({
      accounts: VALID_PREDEFINED_ACCOUNTS,
    });
    return this.mailer
      .connect()
      .then(() => {
        return this.mailer.router(
          {
            account: VALID_PREDEFINED_ACCOUNTS['test-example'],
            email: {
              to: 'v@makeomatic.ru',
              html: 'very important stuff',
              from: 'test mailer <v@makeomatic.ru>',
            },
          },
          {
            routingKey: 'adhoc',
          }
        );
      });
  });

  afterEach('closes mailer', function stopMailer() {
    return this.mailer && this.mailer.close().then(() => {
      this.mailer = null;
    });
  });

  afterEach('close smtp service', function stopSMTPServer(done) {
    this.server.close(done);
  });
});
