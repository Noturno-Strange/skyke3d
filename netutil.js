/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Utilidades puras de rede: normalização de IP, chave de limite por /64 e
 * extração do IP real a partir de proxies confiáveis.
 */
'use strict';

const net = require('net');

/** Normaliza um endereço vindo do socket ou de um cabeçalho. */
function normIp(value) {
  let s = typeof value === 'string' ? value.trim() : '';
  if (!s) return '?';
  const zone = s.indexOf('%');
  if (zone > 0) s = s.slice(0, zone);
  if (s.startsWith('::ffff:') && net.isIP(s.slice(7)) === 4) s = s.slice(7);
  return net.isIP(s) ? s.toLowerCase() : '?';
}

function v4Groups(text) {
  const v4 = text.split('.').map(Number);
  if (v4.length !== 4 || v4.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return [((v4[0] << 8) | v4[1]).toString(16), ((v4[2] << 8) | v4[3]).toString(16)];
}

function ipv6Groups(value) {
  const ip = normIp(value);
  if (net.isIP(ip) !== 6) return null;
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  // Um IPv4 embutido só pode ocupar o fim do endereço e vale por dois grupos.
  const expandLast = arr => {
    if (!arr.length || !arr[arr.length - 1].includes('.')) return arr;
    const tail = v4Groups(arr[arr.length - 1]);
    return tail ? [...arr.slice(0, -1), ...tail] : null;
  };
  let groups;
  if (halves.length === 2) {
    const tail = expandLast(right);
    if (!tail) return null;
    const fill = 8 - left.length - tail.length;
    if (fill < 0) return null;
    groups = [...left, ...Array(fill).fill('0'), ...tail];
  } else {
    groups = expandLast(left);
    if (!groups) return null;
  }
  if (groups.length !== 8) return null;
  return groups.map(g => parseInt(g, 16) || 0);
}

/**
 * Chave de limite por cliente. IPv4 usa o endereço completo; IPv6 usa o /64,
 * porque um único cliente normalmente controla o bloco inteiro.
 */
function rateKey(value) {
  const ip = normIp(value);
  if (net.isIP(ip) === 4) return ip;
  const groups = ipv6Groups(ip);
  if (!groups) return ip;
  return groups.slice(0, 4).map(n => n.toString(16)).join(':') + '::/64';
}

/**
 * Retorna o IP do cliente.
 *
 * - O IP do socket só é substituído quando ele próprio é um proxy confiável.
 * - `X-Forwarded-For` é percorrido da direita para a esquerda, ignorando os
 *   proxies confiáveis. O primeiro IP não confiável é o cliente.
 * - Um XFF malformado na ponta direita não autoriza olhar para a esquerda:
 *   nesse caso voltamos ao IP do socket.
 * - `CF-Connecting-IP` só é usado quando `cfEnabled` é verdadeiro (opt-in).
 */
/** @param {{remote?:string, xff?:string, cf?:string, cfEnabled?:boolean, trusted?:(ip:string)=>boolean}} [o] */
function firstClientIp({ remote, xff, cf, cfEnabled = false, trusted = () => false } = {}) {
  const remoteIp = normIp(remote);
  if (net.isIP(remoteIp) === 0) return remoteIp;

  let isTrusted = false;
  try { isTrusted = !!trusted(remoteIp); } catch (e) { /* proxy inválido */ }
  if (!isTrusted) return remoteIp;

  if (cfEnabled) {
    const cfIp = normIp(cf);
    if (net.isIP(cfIp)) return cfIp;
  }

  if (typeof xff !== 'string' || !xff) return remoteIp;
  const parts = xff.split(',');
  const last = normIp(parts[parts.length - 1]);
  if (!net.isIP(last)) return remoteIp;

  let fallback = last;
  for (let i = parts.length - 1; i >= 0; i--) {
    const ip = normIp(parts[i]);
    if (!net.isIP(ip)) return remoteIp;
    let hopTrusted = false;
    try { hopTrusted = !!trusted(ip); } catch (e) { /* proxy inválido */ }
    if (!hopTrusted) return ip;
    fallback = ip;
  }
  return fallback;
}

/**
 * true só para endereços de internet pública: recusa loopback, rede privada, CGNAT,
 * link-local, multicast, documentação, 6to4/NAT64 e IPv6 local (inclusive IPv4 mapeado).
 */
function isPublicAddress(value) {
  const ip = normIp(value);
  const kind = net.isIP(ip);
  if (!kind) return false;
  if (kind === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  const w = ipv6Groups(ip);
  if (!w) return false;
  if (w.every(x => x === 0) || (w.slice(0, 7).every(x => x === 0) && w[7] === 1)) return false;
  if (w[0] === 0 && w[1] === 0 && w[2] === 0 && w[3] === 0 && w[4] === 0 && w[5] === 0xffff) return isPublicAddress(((w[6] >> 8) & 255) + '.' + (w[6] & 255) + '.' + ((w[7] >> 8) & 255) + '.' + (w[7] & 255));
  if ((w[0] & 0xfe00) === 0xfc00 || (w[0] & 0xffc0) === 0xfe80 || (w[0] & 0xff00) === 0xff00) return false;
  if (w[0] === 0x64 && w[1] === 0xff9b) return false;
  if (w[0] === 0x2002 || (w[0] === 0x2001 && w[1] === 0x0db8)) return false;
  return true;
}

module.exports = { normIp, rateKey, firstClientIp, isPublicAddress };
