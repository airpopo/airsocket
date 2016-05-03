import WebSocket from 'ws';
import chai from 'chai';
import spies from 'chai-spies';
import _ from 'lodash';

const { expect } = chai;
chai.use(spies);

global.WebSocket = WebSocket;
const WebSocketServer = require('ws').Server

const PoPoSocket = require('../index');

const cache = [];
const wss = new WebSocketServer({ port: 5010 });
wss.on('connection', ws => {
  ws.on('message', message => {
    console.log(message);
    message = message.split(':', 4);
    cache.push(message);

    ws.send(message.join(':') + ':ok')
  });
});

const popo = new PoPoSocket('ws://localhost:5010/', 'guest', Date.now(), 3000);

describe("connect", function() {
  this.timeout(5000);

  it("connect success", function(done) {
    const socket = new PoPoSocket('ws://localhost:5010/', 'guest', Date.now(), 3000);
    expect(socket.state).to.equal('connecting');

    _.delay(() => socket.auth().then(() => {
      expect(socket.state).to.equal('ready');
      socket.close();
      done();
    }), 100);
  });

  it("login success", function(done) {
    expect(popo.state).to.equal('ready');

    popo.login('dingtaxi', Date.now()).then(() => {
      expect(popo.state).to.equal('ready');
      done();
    });

    expect(popo.state).to.equal('closed');
  });
});

describe("watchdog", function() {
  this.timeout(5000);

  it("resolve", function(done) {
    const resolve = chai.spy();
    const reject = chai.spy();
    const callback = popo.watchdog(resolve, reject, 1000);

    _.delay(() => callback(), 200);
    _.delay(() => {
      expect(resolve).to.have.been.called();
      expect(reject).to.not.have.been.called();
      done();
    }, 1000);
  });

  it("reject", function(done) {
    const resolve = chai.spy();
    const reject = chai.spy();
    const callback = popo.watchdog(resolve, reject, 500);

    _.delay(() => callback(), 800);
    _.delay(() => {
      expect(resolve).to.not.have.been.called();
      expect(reject).to.have.been.called();
      done();
    }, 1000);
  });
});
