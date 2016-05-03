'use strict';

import _ from 'lodash';

class PoPoSocket {
  ws = null;

  uri = null;

  platform = 'guest';

  token = Date.now();

  timeout = 5000;

  frequencyId = 0;

  callback = {};

  delay = [0, 1, 2, 4, 7, 11, 16];

  delayIdx = 0;

  state = 'closed';

  kill = false;

  readyOnceHandler = [];

  constructor(uri, platform, token, timeout) {
    this.uri = uri;

    if (platform) this.platform = platform;
    if (token) this.token = token;
    if (timeout) this.timeout = timeout;

    this.connect();
  }

  connect() {
    this.state = 'connecting';

    if (this.ws) delete this.ws;

    try {
      this.ws = new WebSocket(this.uri + this.platform + '_' + this.token);

      this.ws.onopen = () => {
        this.delayIdx = 0;
        this.auth();
      } ;
      this.ws.onmessage = (e) => this.onMessage(e.data);
      this.ws.onerror = (e) => this.onError(e);
      this.ws.onclose = (e) => this.onClose(e);
    } catch (e) {
      console.log('[Error] scala connect: ', e.message);
      this.reconnect();
    }
  }

  auth() {
    this.state = 'login';

    return this
      .send('auth/' + this.platform, this.token, -1)
      .then(() => {
        this.state = 'ready'
        let handler;
        while(handler = this.readyOnceHandler.pop()) handler();
        return;
      }, (e) => {
        console.log('[Error] scala auth: ', e.message);
        return e;
      });
  }

  reconnect() {
    this.delayIdx += 1;
    if (this.delayIdx >= this.delay.length) this.delay = this.delay.length - 1;

    _.delay(() => this.connect(), this.delay[this.delayIdx] * 1000);
  }

  watchdog(resolve, reject, timeout) {
    if (timeout <= 0) timeout = 3000;
    let called = false;

    setTimeout(() => {
      if (called) return;

      called = true;
      reject.apply(this, [new Error('Timeout')]);
    }, timeout);

    return () => {
      if (called) return;

      called = true;
      resolve.apply(this, arguments);
    };
  }

  login(platform, token) {
    this.platform = platform;
    this.token = token;
    this.state = 'closed';
    this.ws.close();

    return new Promise((resolve, reject) => {
      this.readyOnceHandler.push(this.watchdog(resolve, reject, 5000));
    });
  }

  close() {
    this.kill = true;
    this.ws.close();
  }

  send(path, data, retry) {
    if (_.isUndefined(retry) || _.isNull(retry)) retry = 4;

    return new Promise((resolve, reject) => {
      if (this.state !== 'ready' && retry !== -1) {
        if (retry && retry > 0) {
          return _.delay(function () {
            return this.send(path, data, retry - 1).then(resolve, reject);
          }, 1000);
        } else return reject(new Error('ConnectionFailed'));
      }

      this.frequencyId = this.frequencyId + 1;
      data = JSON.stringify(_.isObject(data) ? data : {});
      data = '' + Date.now() + ':' + path + '::' + this.frequencyId + ':' + data;

      this.callback[this.frequencyId + ''] = this.watchdog(reply => {
        _.isError(reply) ? reject(reply) : resolve(reply);
      }, reject, this.timeout);

      this.ws.send(data);
    });
  }

  onMessage(data) {
    const reply = /^(\d+):([^:]*):([^:]*):(\d+):(ok|failed) ?(.*)$/i.exec(data);
    const frequencyId = reply[4];
    const status = reply[5]
    const results = JSON.parse(reply[6] || '{}');

    const callback = this.callback[frequencyId];
    callback && callback(status === 'ok' ? results : new Error(results));

    delete this.callback[frequencyId];
  }

  onError(e) {
    console.log('[Error] scala error: ', e.message);
  }

  onClose(e) {
    console.log('[Error] scala close: ', e.code, e.reason);
    this.state = 'closed';
    !this.kill && this.reconnect();
  }
}

module.exports = PoPoSocket;
