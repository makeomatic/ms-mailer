const { SMTPServer } = require('smtp-server');
const AMQPTransport = require('ms-amqp-transport');

// basic configuration
exports.AMQPConfiguration = {
  transport: {
    debug: true,
    connection: {
      host: 'rabbitmq',
      port: 5672,
    },
  },
};

// helper functios
exports.start = function startSMTPServer(done) {
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
};

exports.stop = function stopSMTPServer(done) {
  this.server.close(done);
};

exports.mailerStart = function startMailerService() {
  const Mailer = require('../src');
  this.mailer = new Mailer({
    logger: {
      defaultLogger: true,
      debug: true,
    },
    debug: true,
    accounts: exports.VALID_PREDEFINED_ACCOUNTS,
    amqp: exports.AMQPConfiguration,
  });
  return this.mailer.connect();
};

exports.mailerStop = function stopMailerService() {
  return this.mailer && this.mailer.close().finally(() => {
    this.mailer = null;
  });
};

exports.getAMQPConnection = () => (
  AMQPTransport
  .connect(exports.AMQPConfiguration.transport)
  .disposer(amqp => amqp.close())
);

exports.VALID_PREDEFINED_ACCOUNTS = {
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

exports.TEST_EMAIL = {
  to: 'v@makeomatic.ru',
  html: 'very important stuff',
  from: 'test mailer <v@example.com>',
};
