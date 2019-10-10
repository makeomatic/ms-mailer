/* eslint-disable import/no-dynamic-require */

const { Microfleet, ConnectorsTypes } = require('@microfleet/core');
const Promise = require('bluebird');
const Errors = require('common-errors');
const nodemailer = require('nodemailer');
const inlineBase64 = require('nodemailer-plugin-inline-base64');
const merge = require('lodash/merge');
const defaults = require('lodash/defaults');
const identity = require('lodash/identity');
const { htmlToText } = require('nodemailer-html-to-text');
const conf = require('./config');

/**
 * @class Mailer
 */
class Mailer extends Microfleet {
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
    this.addConnector(ConnectorsTypes.essential, () => (
      Promise.each(accountNames, async (accountKey) => {
        const account = accounts[accountKey];
        const transport = await this.initTransport(account, limits);
        transports.set(accountKey, transport);
        this.log.info({ namespace: 'accounts' }, 'created transport %s', accountKey);
        return transport;
      })
    ));

    // close smtp transport right away so that we can't send new messages
    // and can't ack/retry/reject either as they are stuck in there until
    // we close the app - at which point they will be retried automatically
    this.addDestructor(ConnectorsTypes.application, () => (
      Promise.bind(this, this._transports).map(this.closeTransport)
    ));
  }

  /**
   * Returns existing transport for the account
   * @param  {String} accountName [description]
   * @return {Promise}
   */
  async getTransport(accountName) {
    const transport = this._transports.get(accountName);
    if (transport) {
      return transport;
    }

    throw new Errors.NotFoundError(`can't find transport for "${accountName}"`);
  }

  /**
   * Initializes disposable transport
   * @return {Disposer}
   */
  initDisposableTransport(...args) {
    return Promise
      .resolve(this.initTransport(...args))
      .disposer((transport) => transport.close());
  }

  /**
   * Initializes transport with passed credentials
   * @param  {Object} credentials
   * @param  {Object} opts
   * @return {Promise}
   */
  async initTransport(credentials, _opts) {
    const opts = defaults(_opts, {
      pool: true,
      rateLimit: 5,
      logger: this.log,
      debug: this.config.debug,
    });

    return this.validate('credentials', credentials)
      .then((input) => {
        // return either the same settings or transport wrapper
        const transport = input.transport
          ? require(require.resolve(`nodemailer-${input.transport}-transport`))
          : identity;

        const finalOpts = {
          logger: true, debug: true, ...input, ...opts,
        };

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
        transporter.use('compile', htmlToText(this.config.htmlToText));

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
}

/**
 * Default options that are merged into core
 * @type {Object}
 */
Mailer.defaultOpts = conf.get('/', { env: process.env.NODE_ENV });

module.exports = Mailer;
