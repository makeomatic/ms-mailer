// this file is cloned from the library nodemailer-sparkpost-transport cos we need to add return_path into custom fields
/* eslint-disable no-prototype-builtins */
/* eslint-disable array-callback-return */
/* eslint-disable consistent-return */
const SparkPost = require('sparkpost');

// Constructor
function SparkPostTransport(options = {}) {
  let opt;

  // Set required properties
  this.name = 'SparkPost';

  // Set the SparkPost API Key (must have appropriate Transmission resource permissions)
  this.sparkPostApiKey = process.env.SPARKPOST_API_KEY || options.sparkPostApiKey;
  this.sparkPostEmailClient = new SparkPost(this.sparkPostApiKey, {
    stackIdentity: 'clone-nodemailer-sparkpost-transport',
    endpoint: options.endpoint,
  });

  // Set any options which are valid
  // eslint-disable-next-line guard-for-in,no-restricted-syntax
  for (opt in options) {
    this[opt] = (options.hasOwnProperty(opt)) ? options[opt] : undefined;
  }

  return this;
}

function populateCustomFields({ data }, defaults, request) {
  const customFields = ['campaign_id', 'metadata', 'substitution_data', 'options', 'content', 'recipients', 'return_path'];

  // Apply default SP-centric options and override if provided in mail object
  customFields.forEach(function (fld) {
    if (data.hasOwnProperty(fld)) {
      request[fld] = data[fld];
    } else if (defaults.hasOwnProperty(fld)) {
      request[fld] = defaults[fld];
    }
  });
}

function populateFrom(inreq, outreq) {
  if (inreq.from) {
    if (typeof inreq.from === 'object') {
      outreq.content.from = {
        name: inreq.from.name || null,
        email: inreq.from.address,
      };
    } else {
      outreq.content.from = inreq.from;
    }
  }
}

function populateInlineStdFields(message, resolveme, request) {
  const { data } = message;
  const resolveKeys = ['html', 'text'];
  const contentFlds = {
    subject: 'subject',
    headers: 'headers',
    replyTo: 'reply_to',
  };

  populateFrom(data, request);

  // content fields that get transferred to request
  Object.keys(contentFlds).map(function (key) {
    if (data.hasOwnProperty(key)) {
      request.content[contentFlds[key]] = data[key];
    }
  });

  // content that gets resloved
  resolveKeys.map(function (key) {
    if (data.hasOwnProperty(key)) {
      resolveme[key] = key;
    }
  });

  // format attachments
  if (data.attachments) {
    const spAttachments = [];

    data.attachments.map(function (att) {
      spAttachments.push({
        name: att.filename,
        type: att.contentType,
        data: att.content,
      });
    });

    request.content.attachments = spAttachments;
  }
}

function emailList(strOrLst) {
  let lst = strOrLst;
  if (typeof strOrLst === 'string') {
    lst = strOrLst.split(',');
  }

  return lst.map(function (addr) {
    if (typeof addr === 'string') {
      return { address: addr };
    }
    return {
      address: {
        name: addr.name,
        email: addr.address,
      },
    };
  });
}

function populateRecipients(request, msgData) {
  if (msgData.to) {
    request.recipients = emailList(msgData.to) || [];
  }

  if (msgData.cc) {
    request.cc = emailList(msgData.cc);
  }

  if (msgData.bcc) {
    request.bcc = emailList(msgData.bcc);
  }
}

SparkPostTransport.prototype.send = function send(message, callback) {
  const { data } = message;
  const request = {
    content: {},
  };
  const resolveme = {};

  // Conventional nodemailer fields override SparkPost-specific ones and defaults
  populateCustomFields(message, this, request);

  populateRecipients(request, data);

  if (data.raw) {
    resolveme.raw = 'email_rfc822';
  } else {
    populateInlineStdFields(message, resolveme, request);
  }

  this.resolveAndSend(message, resolveme, request, callback);
};

SparkPostTransport.prototype.resolveAndSend = function (mail, toresolve, request, callback) {
  const self = this;
  const keys = Object.keys(toresolve);

  if (keys.length === 0) {
    return this.sendWithSparkPost(request, callback);
  }

  // eslint-disable-next-line one-var
  const srckey = keys[0],
    dstkey = toresolve[keys[0]];

  delete toresolve[srckey];

  this.loadContent(mail, srckey, function (err, content) {
    request.content[dstkey] = content;
    self.resolveAndSend(mail, toresolve, request, callback);
  });
};

SparkPostTransport.prototype.loadContent = function (mail, key, callback) {
  const content = mail.data[key];
  if (typeof content === 'string') {
    return process.nextTick(function () {
      callback(null, content);
    });
  }

  mail.resolveContent(mail.data, key, function (err, res) {
    if (err) {
      return callback(err);
    }
    callback(null, res.toString());
  });
};

SparkPostTransport.prototype.sendWithSparkPost = function (transBody, callback) {
  this.sparkPostEmailClient.transmissions.send(transBody, function (err, res) {
    if (err) {
      return callback(err);
    }
    // Example successful Sparkpost transmission response:
    // { "results": { "total_rejected_recipients": 0, "total_accepted_recipients": 1, "id": "66123596945797072" } }
    return callback(null, {
      messageId: res.results.id,
      accepted: res.results.total_accepted_recipients,
      rejected: res.results.total_rejected_recipients,
    });
  });
};

module.exports = function (options) {
  return new SparkPostTransport(options);
};
