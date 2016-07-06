const Mservice = require('mservice');
const Promise = require('bluebird');
const Errors = require('common-errors');
const ld = require('lodash');
const nodemailer = require('nodemailer');
const signer = require('nodemailer-dkim').signer;
const inlineBase64 = require('nodemailer-plugin-inline-base64');
const htmlToText = require('nodemailer-html-to-text').htmlToText;
const path = require('path');
const debug = require('debug')('ms-mailer');

/**
 * Accepts/rejects messages
 */
function ack(err, data, actionName, actions) {
  if (!err) {
    actions.ack();
    return data;
  }

  if (err.name === 'ValidationError' || actionName === 'adhoc') {
    actions.reject();
    return Promise.reject(err);
  }

  // assume that predefined accounts must not fail - credentials are correct
  this.log.error('error performing operation %s. Scheduling retry', actionName, err);
  actions.retry();
  return Promise.reject(err);
}

/**
 * @class Mailer
 */
module.exports = class Mailer extends Mservice {

  /**
   * Default options that are merged into core
   * @type {Object}
   */
  static defaultOpts = {
    debug: process.env.NODE_ENV === 'development',
    logger: process.env.NODE_ENV === 'development',
    predefinedLimits: {
      maxConnections: 2,
      maxMessages: 2000,
    },
    amqp: {
      queue: 'ms-mailer',
      neck: 100,
      prefix: 'mailer',
      postfix: path.join(__dirname, 'actions'),
      initRouter: true,
      initRoutes: true,
      onComplete: ack,
    },
    // https://www.npmjs.com/package/html-to-text
    htmlToText: {
      wordwrap: 140,
    },
    plugins: ['validator', 'logger', 'amqp'],
    validator: ['../schemas'],
  };

  /**
   * Updates default options and sets up predefined accounts
   * @param  {Object} opts
   * @return {Mailer}
   */
  constructor(opts = {}) {
    super(ld.merge({}, Mailer.defaultOpts, opts));

    const config = this.config;
    const { error } = this.validateSync('config', config);
    if (error) {
      this.log.fatal('invalid configuration', error.toJSON());
      throw error;
    }

    // init predefined transports
    const accounts = config.accounts || {};
    const accountNames = Object.keys(accounts);
    const transports = this._transports = {};
    const limits = config.predefinedLimits;

    this._initTransports = Promise.each(accountNames, accountKey => {
      const account = accounts[accountKey];
      return this.initTransport(account, limits).then(transport => {
        transports[accountKey] = transport;
        this.log.info({ namespace: 'accounts' }, 'created transport %s', accountKey);
      });
    });
  }

  /**
   * Promise wrapper over smtp transport
   * @param  {Object} transport
   * @param  {Object} email
   * @return {Promise}
   */
  sendMail(transport, email) {
    debug('trying to send email %j', email);
    return Promise.fromNode(next => transport.sendMail(email, next));
  }

  /**
   * Returns existing transport for the account
   * @param  {String} accountName [description]
   * @return {Promise}
   */
  getTransport(accountName) {
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
    const opts = ld.defaults(_opts, {
      maxConnections: 1,
      pool: true,
      rateLimit: 5,
      logger: this._logger,
      debug: this._config.debug,
    });

    return this.validate('credentials', credentials)
      .then(input => {
        const transporter = nodemailer.createTransport({ ...input, ...opts });

        const { dkim } = input;
        if (dkim) {
          transporter.use('stream', signer({
            domainName: dkim.domain,
            keySelector: dkim.selector,
            privateKey: dkim.pk,
          }));
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
    return Promise
      .join(super.connect(), this._initTransports)
      .return(this)
      .tap(() => {
        this.log.info('connected to amqp and transports');
      });
  }

  /**
   * Closes opened nodemailer transport
   * @param  {String} email
   */
  closeTransport(email) {
    this._transports[email].close();
    delete this._transports[email];
    this.log.debug('removed transport %s', email);
  }

  /**
   * Closes connection to AMQP exchange, removes predefined transports
   * @return {Promise}
   */
  close() {
    const openedTransports = Object.keys(this._transports);

    return Promise.join(
      super.close(),
      Promise.bind(this).return(openedTransports).map(this.closeTransport)
    );
  }

};
