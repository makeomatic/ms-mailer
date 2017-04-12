const Promise = require('bluebird');
const chai = require('chai');
const render = require('ms-mailer-templates');
const smtp = require('../helpers');

const expect = chai.expect;

describe('MS Mailer', function AMQPTransportTestSuite() {
  const Mailer = require('../../src');

  beforeEach('init smtp service', smtp.start);
  afterEach('close smtp service', smtp.stop);

  describe('various mailer configurations', function configSuite() {
    let mailer;

    it('successfully starts mailer', function test() {
      mailer = new Mailer({ amqp: smtp.AMQPConfiguration });
      return mailer.connect()
        .reflect()
        .then((result) => {
          expect(result.isFulfilled()).to.be.eq(true);
          return null;
        });
    });

    it('fails to start mailer on invalid configuration', function test() {
      expect(() =>
        new Mailer({
          amqp: { ...smtp.AMQPConfiguration, prefix: false },
        })
      ).to.throw({ name: 'ValidationError' });
    });

    it('is able to setup transports for a predefined account', function test() {
      mailer = new Mailer({
        accounts: smtp.VALID_PREDEFINED_ACCOUNTS,
        amqp: smtp.AMQPConfiguration,
      });

      return mailer
        .connect()
        .then(() => {
          expect(mailer._transports.has('test-example')).to.be.eq(true);
          return null;
        });
    });

    afterEach(function clean() {
      return mailer && mailer.close().reflect();
    });
  });

  describe('connected service', function suite() {
    before('start mailer', smtp.mailerStart);

    it('is able to send a message via predefined account', function test() {
      return Promise.using(smtp.getAMQPConnection(), amqp =>
        amqp.publishAndWait('mailer.predefined', {
          account: 'test-example',
          email: smtp.TEST_EMAIL,
        })
        .then((msg) => {
          expect(msg.response).to.be.eq('250 OK: message queued');
          return null;
        })
      );
    });

    it('is able to send a message via amqp/adhoc', function test() {
      return Promise.using(smtp.getAMQPConnection(), amqp =>
        amqp.publishAndWait('mailer.adhoc', {
          account: smtp.VALID_PREDEFINED_ACCOUNTS['test-example'],
          email: smtp.TEST_EMAIL,
        })
        .then((msg) => {
          expect(msg.response).to.be.eq('250 OK: message queued');
          return null;
        })
      );
    });

    it('is able to send email with inlined base64 images', function test() {
      return render('cpst-activate', {})
        .then(template =>
          Promise.using(smtp.getAMQPConnection(), amqp =>
            amqp.publishAndWait('mailer.adhoc', {
              account: smtp.VALID_PREDEFINED_ACCOUNTS['test-example'],
              email: {
                to: 'v@makeomatic.ru',
                html: template,
                from: 'test mailer <v@example.com>',
              },
            })
            .then((msg) => {
              expect(msg.response).to.be.eq('250 OK: message queued');
              return null;
            })
          )
        );
    });

    it('is able to send email with string tpl & ctx', function test() {
      return Promise.using(smtp.getAMQPConnection(), amqp =>
        amqp.publishAndWait('mailer.adhoc', {
          account: smtp.VALID_PREDEFINED_ACCOUNTS['test-example'],
          email: 'cpst-activate',
          ctx: {
            nodemailer: {
              to: 'v@makeomatic.ru',
              from: 'test mailer <v@example.com>',
            },
            template: {
              random: true,
            },
          },
        })
        .then((msg) => {
          expect(msg.response).to.be.eq('250 OK: message queued');
          return null;
        })
      );
    });

    after('cleanup mailer', smtp.mailerStop);
  });
});
