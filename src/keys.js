import crypto from 'node:crypto';
import * as store from './store.js';
import { grantPremium } from './access.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function chunk(n = 4) {
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return s;
}

export function createKey({ type = 'premium', days = 30, maxUses = 1, infinite = false, createdBy }) {
  const key = `${chunk()}-${chunk()}-${chunk()}`;
  store.db_().keys[key] = {
    key,
    type,
    days: infinite ? Infinity : days,
    maxUses: infinite ? Infinity : maxUses,
    uses: 0,
    redeemedBy: [],
    infinite,
    createdBy,
    createdAt: Date.now(),
    revoked: false,
  };
  store.save(true);
  return key;
}

export const peek = (key) => store.db_().keys[key.toUpperCase().trim()] || null;

export function redeem(key, userId) {
  const k = peek(key);
  if (!k) return { ok: false, error: 'Invalid key.' };
  if (k.revoked) return { ok: false, error: 'Ye key revoke ho chuki hai.' };
  if (k.redeemedBy.includes(userId)) return { ok: false, error: 'Tum ye key already use kar chuke ho.' };
  if (k.type === 'trial' && store.user(userId).usedKeys.includes('TRIAL'))
    return { ok: false, error: 'Trial lifetime me sirf ek baar milta hai.' };
  if (k.uses >= k.maxUses) return { ok: false, error: 'Ye key ki limit khatam ho gayi.' };

  k.uses += 1;
  k.redeemedBy.push(userId);
  const u = store.user(userId);
  u.usedKeys.push(k.type === 'trial' ? 'TRIAL' : k.key);
  grantPremium(userId, k.infinite ? Infinity : k.days, 'key');
  store.save(true);
  return { ok: true, key: k };
}

export function revokeKey(key) {
  const k = peek(key);
  if (!k) return false;
  k.revoked = true;
  store.save(true);
  return true;
}
