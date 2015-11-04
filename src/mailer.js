const AMQPTransport = require('ms-amqp-transport');
const Validation = require('ms-amqp-validation');
const Promise = require('bluebird');
const Errors = require('common-errors');
const ld = require('lodash');
const path = require('path');
const EventEmitter = require('eventemitter3');
const nodemailer = require('nodemailer');
const smtpPool = require('nodemailer-smtp-pool');
const signer = require('nodemailer-dkim').signer;
const inlineBase64 = require('nodemailer-plugin-inline-base64');
const htmlToText = require('nodemailer-html-to-text').htmlToText;
const { format: fmt } = require('util');

// postfix configuration
const validator = new Validation(path.resolve(__dirname, './schemas'));
const { validate } = validator;
const validatorInitPromise = validator.init();

module.exports = class Mailer extends EventEmitter {

  static defaultOpts = {
    debug: process.env.NODE_ENV === 'development',
    postfix_adhoc: process.env.MS_MAILER_ADHOC_POSTFIX || 'adhoc',
    postfix_predefined: process.env.MS_MAILER_PREDEFINED_POSTFIX || 'predefined',
    prefix: process.env.MS_MAILER_PREFIX || 'mailer',
    predefinedLimits: {
      maxConnections: process.env.MS_MAILER_PRE_MAX_CONNECTIONS || 2,
      maxMessages: process.env.MS_MAILER_PRE_MAX_MESSAGES || 2000,
    },
    amqp: {
      queue: process.env.MS_MAILER_QUEUE_NANE || 'ms-mailer',
    },
    // https://www.npmjs.com/package/html-to-text
    htmlToText: {
      tables: [],
      wordwrap: process.env.MS_MAILER_WORD_WRAP || 140,
      linkHrefBaseUrl: process.env.MS_MAILER_LINK_HREF_BASE_URL || null,
      hideLinkHrefIfSameAsText: true,
      ignoreHref: true,
      ignoreImage: true,
    },
  };

  constructor(opts = {}) {
    super();
    const config = this._config = ld.merge({}, Mailer.defaultOpts, opts);

    // setup routes to listen
    const prefix = config.prefix;
    config.amqp.listen = [ config.postfix_adhoc, config.postfix_predefined ].map((postfix) => {
      return `${prefix}.${postfix}`;
    });

    if (config.debug === true) {
      this.on('log', this.log.bind(this, 'ms-mailer'));
    }

    // init predefined transports
    const predefinedAccounts = config.accounts || {};
    const accountNames = Object.keys(predefinedAccounts);
    this._initTransports = Promise.reduce(accountNames, (transports, accountKey) => {
      return this.initTransport(predefinedAccounts[accountKey], config.predefinedLimits)
        .then((transport) => {
          transports[accountKey] = transport;
          return transports;
        });
    }, {})
    .then((transports) => {
      this._transports = transports;
    });
  }

  log = (namespace, message) => {
    process.stdout.write(`${namespace}> ${message}\n`);
  }

  router = (message, headers, actions, next) => {
    const route = headers.routingKey.split('.').pop();

    switch (route) {
    case this._config.postfix_predefined:
      return this.predefined(message, headers, actions, next);
    case this._config.postfix_adhoc:
      return this.adhoc(message, headers, actions, next);
    default:
      return next(new Errors.NotImplementedError(fmt('method "%s" is not supported', route)));
    }
  }

  predefined(message, headers, actions, next) {
    return validate('predefined', message)
      .return(message.account)
      .then(this.getTransport)
      .then((transport) => {
        return this.sendMail(transport, message.email);
      })
      .asCallback(next);
  }

  adhoc(message, headers, actions, next) {
    return validate('adhoc', message)
      .then(() => {
        const disposableConnection = this.initDisposableTransport(message.account);
        return Promise.using(disposableConnection, (transport) => {
          return this.sendMail(transport, message.email);
        });
      })
      .asCallback(next);
  }

  sendMail = (transport, email) => {
    return Promise.fromNode((next) => {
      transport.sendMail(email, next);
    });
  }

  getTransport = (accountName) => {
    const transport = this._transports[accountName];
    if (transport) {
      return Promise.resolve(transport);
    }

    return Promise.reject(new Errors.NotFoundError(`can't find transport for "${accountName}"`));
  }

  initDisposableTransport() {
    return this.initTransport.apply(this, arguments)
      .disposer(function disposeOfConnection(transport) {
        transport.close();
      });
  }

  initTransport(credentials, opts = { maxConnections: 1 }) {
    return validate('credentials', credentials)
      .then(() => {
        const params = ld.merge({ debug: this._config.debug }, credentials, opts);
        const transporter = nodemailer.createTransport(smtpPool(params));

        if (params.dkim) {
          const { dkim } = params;
          if (dkim) {
            transporter.use('stream', signer({
              domainName: dkim.domain,
              keySelector: dkim.selector,
              privateKey: dkim.pk,
            }));
          }
        }

        if (params.debug) {
          transporter.on('log', this.log.bind(this, 'ms-mailer|smtp-transport'));
        }

        transporter.use('compile', inlineBase64);
        transporter.use('compile', htmlToText(this._config.htmlToText));

        return transporter;
      });
  }

  connect() {
    if (this._amqp) {
      return Promise.reject(new Errors.NotPermittedError('service was already started'));
    }

    // once transport is initialized - return instance of self
    return validatorInitPromise
      .then(() => {
        return validate('config', this._config);
      })
      .then(() => {
        const amqp = this._amqp = AMQPTransport.connect(this._config.amqp, this.router);
        return Promise.all([ amqp, this._initTransports ]);
      })
      .return(this);
  }

  close() {
    if (!this._amqp) {
      return Promise.reject(new Errors.NotPermittedError('service is not online'));
    }

    return Promise.all([
      this._amqp.close().then(() => {
        this._amqp = null;
        this._initTransports = null;
      }),
      Promise.map(Object.keys(this._transports), (email) => {
        delete this._transports[email];
        return Promise.fromNode((next) => {
          this._transports[email].close(next);
        });
      }),
    ]);
  }

};
