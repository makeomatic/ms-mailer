/* eslint-disable import/no-dynamic-require */

const Mservice = require('mservice');
const Promise = require('bluebird');
const Errors = require('common-errors');
const nodemailer = require('nodemailer');
const inlineBase64 = require('nodemailer-plugin-inline-base64');
const htmlToText = require('nodemailer-html-to-text').htmlToText;
const path = require('path');

const merge = require('lodash/merge');
const defaults = require('lodash/defaults');
const identity = require('lodash/identity');

const onComplete = require('./onComplete');

/**
 * @class Mailer
 */
module.exports = class Mailer extends Mservice {

  /**
   * Default options that are merged into core
   * @type {Object}
   */
  static defaultOpts = {
    debug: process.env.NODE_ENV !== 'production',
    logger: {
      defaultLogger: true,
      debug: process.env.NODE_ENV !== 'production',
    },
    predefinedLimits: {
      maxConnections: 20,
      maxMessages: Infinity,
    },
    amqp: {
      transport: {
        queue: 'ms-mailer',
        neck: 100,
        onComplete,
      },
      router: {
        enabled: true,
      },
    },
    router: {
      routes: {
        directory: path.join(__dirname, 'actions'),
        prefix: 'mailer',
        setTransportsAsDefault: true,
        transports: [Mservice.ActionTransport.amqp],
      },
      extensions: {
        enabled: ['postRequest', 'preRequest', 'preResponse'],
        register: [
          Mservice.routerExtension('validate/schemaLessAction'),
          Mservice.routerExtension('audit/log'),
        ],
      },
    },
    // https://www.npmjs.com/package/html-to-text
    htmlToText: {
      wordwrap: 140,
    },
    plugins: ['validator', 'logger', 'router', 'amqp'],
    validator: ['../schemas'],
  };

  /**
   * Updates default options and sets up predefined accounts
   * @param  {Object} opts
   * @return {Mailer}
   */
  constructor(opts = {}) {
    super(merge({}, Mailer.defaultOpts, opts));
    const config = this.config;

    // init predefined transports
    const accounts = config.accounts || {};
    const accountNames = Object.keys(accounts);
    const transports = this._transports = new Map();
    const limits = config.predefinedLimits;

    this._initTransports = Promise.each(accountNames, (accountKey) => {
      const account = accounts[accountKey];
      return this.initTransport(account, limits).then((transport) => {
        transports.set(accountKey, transport);
        this.log.info({ namespace: 'accounts' }, 'created transport %s', accountKey);
        return transport;
      });
    });
  }

  /**
   * Returns existing transport for the account
   * @param  {String} accountName [description]
   * @return {Promise}
   */
  getTransport(accountName) {
    const transport = this._transports.get(accountName);
    if (transport) {
      return Promise.resolve(transport);
    }

    return Promise.reject(new Errors.NotFoundError(`can't find transport for "${accountName}"`));
  }

  /**
   * Initializes disposable transport
   * @return {Disposer}
   */
  initDisposableTransport(...args) {
    return this
      .initTransport(...args)
      .disposer(transport => transport.close());
  }

  /**
   * Initializes transport with passed credentials
   * @param  {Object} credentials
   * @param  {Object} opts
   * @return {Promise}
   */
  initTransport(credentials, _opts) {
    const opts = defaults(_opts, {
      pool: true,
      rateLimit: 5,
      logger: this._log,
      debug: this._config.debug,
    });

    return this.validate('credentials', credentials)
      .then((input) => {
        // return either the same settings or transport wrapper
        const transport = input.transport
          ? require(`nodemailer-${input.transport}-transport`) // eslint-disable-line global-require
          : identity;

        const finalOpts = Object.assign({ logger: true, debug: true }, input, opts);

        // has different format
        const dkim = input.dkim;
        if (dkim) {
          finalOpts.dkim = {
            domainName: dkim.domain,
            keySelector: dkim.selector,
            privateKey: dkim.pk,
          };
        }

        const transporter = nodemailer.createTransport(transport(finalOpts));

        transporter.use('compile', inlineBase64({ cidPrefix: 'msm' }));
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
    return Promise
      .join(super.connect(), this._initTransports)
      .return(this)
      .tap(() => {
        this.log.info('connected to amqp and transports');
      });
  }

  /**
   * Closes opened nodemailer transport
   * @param  {Array} [name, transport] from @Iterable
   */
  closeTransport(transportData) {
    const [name, transport] = transportData;
    transport.close();
    this._transports.delete(name);
    this.log.debug('removed transport %s', name);
  }

  /**
   * Closes connection to AMQP exchange, removes predefined transports
   * @return {Promise}
   */
  close() {
    return Promise.join(
      super.close(),
      Promise.bind(this, this._transports).map(this.closeTransport)
    );
  }

};
