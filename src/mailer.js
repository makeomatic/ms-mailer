const Mservice = require('mservice');
const Promise = require('bluebird');
const Errors = require('common-errors');
const ld = require('lodash');
const nodemailer = require('nodemailer');
const smtpPool = require('nodemailer-smtp-pool');
const signer = require('nodemailer-dkim').signer;
const inlineBase64 = require('nodemailer-plugin-inline-base64');
const htmlToText = require('nodemailer-html-to-text').htmlToText;
const { format: fmt } = require('util');

/**
 * @namespace Mailer
 */
module.exports = class Mailer extends Mservice {

  /**
   * Default options that are merged into core
   * @type {Object}
   */
  static defaultOpts = {
    debug: process.env.NODE_ENV === 'development',
    logger: process.env.NODE_ENV === 'development',
    postfixAdhoc: 'adhoc',
    postfixPredefined: 'predefined',
    prefix: 'mailer',
    predefinedLimits: {
      maxConnections: 2,
      maxMessages: 2000,
    },
    amqp: {
      queue: 'ms-mailer',
      neck: 100,
    },
    // https://www.npmjs.com/package/html-to-text
    htmlToText: {
      wordwrap: 140,
    },
    plugins: [ 'validator', 'logger', 'amqp' ],
    validator: [ '../schemas/' ],
  };

  /**
   * Updates default options and sets up predefined accounts
   * @param  {Object} opts
   * @return {Mailer}
   */
  constructor(opts = {}) {
    super(ld.merge({}, Mailer.defaultOpts, opts));
    const config = this._config;

    // setup routes to listen
    const prefix = config.prefix;
    config.amqp.listen = [ config.postfixAdhoc, config.postfixPredefined ].map((postfix) => {
      return `${prefix}.${postfix}`;
    });

    this.log.debug('loaded configuration:', config);

    const { error } = this.validateSync('config', config);
    if (error) {
      this.log.fatal('invalid configuration', error.toJSON());
      throw error;
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
        this.log.info({ namespace: 'accounts' }, 'created transport %s', accountKey);
      });
    });
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
    const time = process.hrtime();
    const route = headers.routingKey.split('.').pop();
    const config = this._config;

    let promise;
    switch (route) {
    case config.postfixPredefined:
      promise = this.predefined(message, headers, actions);
      break;
    case config.postfixAdhoc:
      promise = this.adhoc(message, headers, actions);
      break;
    default:
      promise = Promise.reject(new Errors.NotImplementedError(fmt('method "%s"', route)));
      break;
    }

    // if we have an error
    promise = promise.finally(function auditLog(response) {
      const execTime = process.hrtime(time);
      const meta = {
        message,
        headers,
        latency: execTime[0] * 1000 + (+(execTime[1] / 1000000).toFixed(3)),
      };

      if (response instanceof Error) {
        this.log.error(meta, 'error performing operation', response);
        actions.retry();
      } else {
        this.log.info(meta, 'completed operation');
        actions.ack();
      }
    });

    if (typeof next === 'function') {
      return promise.asCallback(next);
    }

    return promise;
  }

  /**
   * Sends message via a predefined account
   * @param  {Mixed}    message { account: String, email }
   * @param  {Object}   headers
   * @param  {Object}   actions - not handled at the moment
   * @return {Promise}
   */
  predefined(message) {
    return this.validate('predefined', message)
      .bind(this)
      .return(message.account)
      .then(this.getTransport)
      .then((transport) => {
        return this.sendMail(transport, message.email);
      });
  }

  /**
   * Sends message via passed auth params for the account
   * @param  {Mixed}    message { account: Object, email }
   * @param  {Object}   headers
   * @param  {Object}   actions - not handled at the moment
   * @return {Promise}
   */
  adhoc(message) {
    return this.validate('adhoc', message)
      .bind(this)
      .then(function initConnection() {
        const disposableConnection = this.initDisposableTransport(message.account);
        return Promise.using(disposableConnection, (transport) => {
          return this.sendMail(transport, message.email);
        });
      });
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
    return this.validate('credentials', credentials)
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
          const logger = this.log.child({ namespace: 'transport' });
          transporter.on('log', (...args) => {
            logger.debug.apply(logger, args);
          });
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
    return Promise.join(
      super.connect(),
      this._initTransports,
    )
    .return(this)
    .tap(() => {
      this.log.info('connected to amqp and transports');
    });
  }

  /**
   * Closes connection to AMQP exchange, removes predefined transports
   * @return {Promise}
   */
  close() {
    return Promise.all([
      super.close(),
      Promise.map(Object.keys(this._transports), (email) => {
        this._transports[email].close();
        delete this._transports[email];
        this.log.debug('removed transport %s', email);
      }),
    ]);
  }

};
