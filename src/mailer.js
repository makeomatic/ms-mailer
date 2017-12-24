/* eslint-disable import/no-dynamic-require */

const Mservice = require('@microfleet/core');
const Promise = require('bluebird');
const Errors = require('common-errors');
const nodemailer = require('nodemailer');
const inlineBase64 = require('nodemailer-plugin-inline-base64');
const { htmlToText } = require('nodemailer-html-to-text');
const conf = require('./config');

const merge = require('lodash/merge');
const defaults = require('lodash/defaults');
const identity = require('lodash/identity');

/**
 * @class Mailer
 */
module.exports = class Mailer extends Mservice {
  /**
   * Default options that are merged into core
   * @type {Object}
   */
  static defaultOpts = conf.get('/', { env: process.env.NODE_ENV });

  /**
   * Updates default options and sets up predefined accounts
   * @param  {Object} opts
   * @return {Mailer}
   */
  constructor(opts = {}) {
    super(merge({}, Mailer.defaultOpts, opts));

    const { config } = this;

    // init predefined transports
    const accounts = config.accounts || {};
    const accountNames = Object.keys(accounts);
    const transports = this._transports = new Map();
    const limits = config.predefinedLimits;

    // before transport is initialized - we should open connections
    this.addConnector(Mservice.ConnectorsTypes.essential, () => (
      Promise.each(accountNames, (accountKey) => {
        const account = accounts[accountKey];
        return this.initTransport(account, limits).then((transport) => {
          transports.set(accountKey, transport);
          this.log.info({ namespace: 'accounts' }, 'created transport %s', accountKey);
          return transport;
        });
      })
    ));

    // close smtp transport right away so that we can't send new messages
    // and can't ack/retry/reject either as they are stuck in there until
    // we close the app - at which point they will be retried automatically
    this.addDestructor(Mservice.ConnectorsTypes.application, () => (
      Promise.bind(this, this._transports).map(this.closeTransport)
    ));
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
        const { dkim } = input;
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
   * Closes opened nodemailer transport
   * @param  {Array} [name, transport] from @Iterable
   */
  closeTransport(transportData) {
    const [name, transport] = transportData;
    transport.close();
    this._transports.delete(name);
    this.log.debug('removed transport %s', name);
  }
};
