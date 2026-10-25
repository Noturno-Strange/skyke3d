'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normIp, rateKey, firstClientIp } = require('../netutil');

test('normIp normaliza IPv4 mapeado, zona e caixa', () => {
  assert.equal(normIp('::ffff:203.0.113.5'), '203.0.113.5');
  assert.equal(normIp('2001:DB8::1'), '2001:db8::1');
  assert.equal(normIp('fe80::1%eth0'), 'fe80::1');
  assert.equal(normIp(' 127.0.0.1 '), '127.0.0.1');
  assert.equal(normIp('não-é-ip'), '?');
  assert.equal(normIp(''), '?');
  assert.equal(normIp(null), '?');
});

test('rateKey agrupa IPv6 por /64 e mantém IPv4 inteiro', () => {
  assert.equal(rateKey('203.0.113.5'), '203.0.113.5');
  assert.equal(rateKey('::ffff:203.0.113.5'), '203.0.113.5');
  const a = '2001:db8:abcd:1234:5678:9abc:def0:1234';
  const b = '2001:0db8:abcd:1234::1';
  const c = '2001:db8:abcd:4321::1';
  assert.equal(rateKey(a), rateKey(b));
  assert.notEqual(rateKey(a), rateKey(c));
  assert.match(rateKey(a), /\/64$/);
});

test('rateKey entende IPv6 com IPv4 embutido no fim', () => {
  const key = '2001:db8:abcd:1234::/64';
  assert.equal(rateKey('2001:db8:abcd:1234:0:0:192.0.2.1'), key);
  assert.equal(rateKey('2001:db8:abcd:1234::c000:201'), key);
  assert.equal(rateKey('2001:db8:abcd:1234::192.0.2.1'), key);
  assert.equal(rateKey('::192.0.2.1'), '0:0:0:0::/64');
});

test('firstClientIp ignora XFF quando o socket não é proxy confiável', () => {
  const trusted = ip => ip === '127.0.0.1';
  assert.equal(firstClientIp({
    remote: '198.51.100.5',
    xff: '1.1.1.1',
    trusted
  }), '198.51.100.5');
});

test('firstClientIp percorre XFF da direita para a esquerda', () => {
  const trusted = ip => ip === '127.0.0.1';
  assert.equal(firstClientIp({
    remote: '127.0.0.1',
    xff: '1.1.1.1, 203.0.113.9, 127.0.0.1',
    trusted
  }), '203.0.113.9');
  assert.equal(firstClientIp({
    remote: '127.0.0.1',
    xff: '203.0.113.9',
    trusted
  }), '203.0.113.9');
  assert.equal(firstClientIp({
    remote: '127.0.0.1',
    xff: '10.0.0.7, 10.0.0.8, 127.0.0.1',
    trusted: ip => ip.startsWith('10.') || ip === '127.0.0.1'
  }), '10.0.0.7');
});

test('firstClientIp recusa XFF malformado na ponta direita', () => {
  const trusted = ip => ip === '127.0.0.1';
  assert.equal(firstClientIp({
    remote: '127.0.0.1',
    xff: '1.1.1.1, lixo',
    trusted
  }), '127.0.0.1');
  assert.equal(firstClientIp({
    remote: '127.0.0.1',
    xff: '1.1.1.1, lixo, 127.0.0.1',
    trusted
  }), '127.0.0.1');
});

test('CF-Connecting-IP só vale com opt-in e é preferido ao XFF', () => {
  const trusted = ip => ip === '127.0.0.1';
  const base = {
    remote: '127.0.0.1',
    xff: '1.1.1.1, 127.0.0.1',
    cf: '198.51.100.7',
    trusted
  };
  assert.equal(firstClientIp(base), '1.1.1.1');
  assert.equal(firstClientIp({ ...base, cfEnabled: true }), '198.51.100.7');
  assert.equal(firstClientIp({ ...base, cf: 'inválido', cfEnabled: true }), '1.1.1.1');
});
