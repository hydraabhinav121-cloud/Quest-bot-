import crypto from 'node:crypto';

const KEY = crypto.createHash('sha256').update(process.env.TOKEN_SECRET || 'questall-default-secret').digest();

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv.toString('hex'), c.getAuthTag().toString('hex'), enc.toString('hex')].join(':');
}

export function decrypt(payload) {
  try {
    const [iv, tag, data] = payload.split(':');
    const d = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'hex'));
    d.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([d.update(Buffer.from(data, 'hex')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export const mask = (t) => (!t ? 'N/A' : `${t.slice(0, 14)}...${t.slice(-6)}`);
