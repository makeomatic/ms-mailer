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

/**
 * @namespace Mailer
 */
module.exports = class Mailer extends EventEmitter {

  /**
   * Default options that are merged into core
   * @type {Object}
   */
  static defaultOpts = {
    debug: process.env.NODE_ENV === 'development',
    postfixAdhoc: 'adhoc',
    postfixPredefined: 'predefined',
    prefix: 'mailer',
    predefinedLimits: {
      maxConnections: 2,
      maxMessages: 2000,
    },
    amqp: {
      queue: 'ms-mailer',
    },
    // https://www.npmjs.com/package/html-to-text
    htmlToText: {
      wordwrap: 140,
    },
  };

  /**
   * Updates default options and sets up predefined accounts
   * @param  {Object} opts
   * @return {Mailer}
   */
  constructor(opts = {}) {
    super();
    const config = this._config = ld.merge({}, Mailer.defaultOpts, opts);

    // setup routes to listen
    const prefix = config.prefix;
    config.amqp.listen = [ config.postfixAdhoc, config.postfixPredefined ].map((postfix) => {
      return `${prefix}.${postfix}`;
    });

    if (config.debug === true) {
      this.on('log', this.log.bind(this, 'ms-mailer'));
      this.log('configuration', JSON.stringify(config));
    }

    // init predefined transports
    const predefinedAccounts = config.accounts || {};
    const accountNames = Object.keys(predefinedAccounts);
    const transports = this._transports = {};

    this._initTransports = Promise.each(accountNames, (accountKey) => {
      return this.initTransport(
        predefinedAccounts[accountKey],
        config.predefinedLimits
      )
      .then((transport) => {
        transports[accountKey] = transport;
        this.emit('log', 'accounts', fmt('created transport %s', accountKey));
      });
    });
  }

  /**
   * Simple debugging logger
   * @param  {String} namespace
   * @param  {String} message
   */
  log = (namespace, message) => {
    process.stdout.write(`${namespace}> ${JSON.stringify(message)}\n`);
  }

  /**
   * Core router for the messages
   * @param  {Mixed}    message { account, email }
   * @param  {Object}   headers
   * @param  {Object}   actions - not handled at the moment
   * @param  {Function} next    - response function
   * @return {Promise}
   */
  router = (message, headers, actions, next) => {
    const route = headers.routingKey.split('.').pop();

    switch (route) {
    case this._config.postfix_predefined:
      return this.predefined(message, headers, actions, next);
    case this._config.postfix_adhoc:
      return this.adhoc(message, headers, actions, next);
    default:
      return next(new Errors.NotImplementedError(fmt('method "%s"', route)));
    }
  }

  /**
   * Sends message via a predefined account
   * @param  {Mixed}    message { account: String, email }
   * @param  {Object}   headers
   * @param  {Object}   actions - not handled at the moment
   * @param  {Function} next    - response function
   * @return {Promise}
   */
  predefined(message, headers, actions, next) {
    return validate('predefined', message)
      .return(message.account)
      .then(this.getTransport)
      .then((transport) => {
        return this.sendMail(transport, message.email);
      })
      .asCallback(next);
  }

  /**
   * Sends message via passed auth params for the account
   * @param  {Mixed}    message { account: Object, email }
   * @param  {Object}   headers
   * @param  {Object}   actions - not handled at the moment
   * @param  {Function} next    - response function
   * @return {Promise}
   */
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

  /**
   * Promise wrapper over smtp transport
   * @param  {Object} transport
   * @param  {Object} email
   * @return {Promise}
   */
  sendMail = (transport, email) => {
    return Promise.fromNode((next) => {
      transport.sendMail(email, next);
    });
  }

  /**
   * Returns existing transport for the account
   * @param  {String} accountName [description]
   * @return {Promise}
   */
  getTransport = (accountName) => {
    const transport = this._transports[accountName];
    if (transport) {
      return Promise.resolve(transport);
    }

    return Promise.reject(new Errors.NotFoundError(`can't find transport for "${accountName}"`));
  }

  /**
   * Initializes disposable transport
   * @return {Disposer}
   */
  initDisposableTransport() {
    return this.initTransport
      .apply(this, arguments)
      .disposer(function disposeOfConnection(transport) {
        transport.close();
      });
  }

  /**
   * Initializes transport with passed credentials
   * @param  {Object} credentials
   * @param  {Object} opts
   * @return {Promise}
   */
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

  /**
   * Connects to AMQP exchange, makes sure predefined accounts are created
   * and validation is initialized
   * @return {Promise}
   */
  connect() {
    if (this._amqp) {
      return Promise.reject(new Errors.NotPermittedError('service was already started'));
    }

    // once transport is initialized - return instance of self
    const config = this._config;
    return validatorInitPromise
      .then(() => {
        return validate('config', config);
      })
      .then(() => {
        return Promise.all([
          AMQPTransport.connect(config.amqp, this.router).then((amqp) => {
            this._amqp = amqp;
          }),
          this._initTransports,
        ]);
      })
      .return(this);
  }

  /**
   * Closes connection to AMQP exchange, removes predefined transports
   * @return {Promise}
   */
  close() {
    if (!this._amqp) {
      return Promise.reject(new Errors.NotPermittedError('service is not online'));
    }

    return Promise.all([
      this._amqp.close().then(() => {
        this._amqp.removeListener('log', this.log);
        this._amqp = null;
        this._initTransports = null;
      }),
      Promise.map(Object.keys(this._transports), (email) => {
        this._transports[email].close();
        delete this._transports[email];
        this.emit('log', 'accounts', fmt('removed transport %s', email));
      }),
    ]);
  }

};
