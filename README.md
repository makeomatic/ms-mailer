# Mailer Microservice

Sets up a rabbitmq consumer with QoS, and distributes incoming messages based on passed options

[![npm version](https://badge.fury.io/js/ms-mailer.svg)](https://badge.fury.io/js/ms-mailer)
[![Build Status](https://semaphoreci.com/api/v1/projects/93fdae46-0b24-4af7-9078-fd369109b906/658194/shields_badge.svg)](https://semaphoreci.com/makeomatic/ms-mailer)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg?style=flat-square)](https://github.com/semantic-release/semantic-release)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
[![codecov.io](https://codecov.io/github/makeomatic/ms-mailer/coverage.svg?branch=master)](https://codecov.io/github/makeomatic/ms-mailer?branch=master)

## Installation

`npm i ms-mailer -S`

Compatible with node >= 7.6.x

## Usage

```js
const Promise = require('bluebird');
const Mailer = require('ms-mailer');
const AMQP = require('ms-amqp-transport');

const mailer = new Mailer({
  debug: Boolean,
  predefinedLimits: {
    maxConnections: Number,
    maxMessages: Number,
  },
  amqp: {
    // ms-amqp-transport options
  },
  htmlToText: {
    // https://www.npmjs.com/package/html-to-text
  },
  accounts: {
    test: {
      // nodemailer smtp transport configuration
      service: 'yahoo',
      auth: {
        user: 'test@yahoo.com',
        pass: '123'
      }
    }
  }
});

// returns promise, which resolves when listeners are established
const mailerReady = mailer.connect();

Promise.props({ mailer: mailerReady, amqp: AMQP.connect() })
.then(function sendMessage(props) {
  const { amqp } = props;
  return amqp.publishAndWait('mailer.predefined', {
    account: 'test',
    email: {
      // nodemailer mail options
      // make sure not to pass streams or paths, as they can't be transferred through the wire
      // as the processing will be held on the other machine
      // in case you want to use some other services like S3, then an expansion can be coded for this module
    }
  });
})
.then(function sendMessageReponse(response) {
  // nodemailer smtp transport response
});

```

## Configuration options

1. `debug` - boolean, whether to print log messages or not
2. `prefix` - which route prefix to bind to, defaults to `mailer`
3. `postfixAdhoc` -  which suffix to use for adhoc messaging
4. `postfixPredefined` - which suffix to use for predefined accounts messaging
5. `predefinedLimits` - which opts to pass to smtp transport constructor for predefined accounts, consult nodemailer-smtp-transport
6. `amqp` - options that are passed to `ms-amqp-transport`
7. `htmlToText` - html to text conversion options for nodemailer
8. `accounts` - predefined accounts that are initialized at service startup, format is the same as in the nodemailer smtp transport

## Messaging format

1. Adhoc messaging `mailer.adhoc`:

```js
{
  "account": String,
  "email": {
    // nodemailer email payload
  }
}
```

2. Predefined messaging `mailer.predefined`:

```js
{
  "account": {
    // nodemailer smtp transport format
  },
  "email": {
    // nodemailer email payload
  }
}
```

## Roadmap

1. test dkim signing
2. test different types of messages being sent
3. test more error cases
4. add QoS handling on demand
