import { BRAND, VERSION, AUTHOR } from './config.js';

export function theme(tier) {
  if (tier === 'premium') {
    return {
      color: 0x2b6cff,
      badge: '👑',
      div: '━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      footer: `${BRAND} ${VERSION} by ${AUTHOR} • Premium • Fast Mode`,
      mode: 'FAST',
      crown: '💎',
    };
  }
  return {
    color: 0x5865f2,
    badge: '📘',
    div: '───────────────────────────',
    footer: `${BRAND} ${VERSION} by ${AUTHOR} • Free`,
    mode: 'STANDARD',
    crown: '🔹',
  };
}

export function bar(pct) {
  const filled = Math.round((pct / 100) * 10);
  return `[${'■'.repeat(filled)}${'□'.repeat(10 - filled)}]`;
}

export function statusLine(state, pct) {
  if (state === 'completed') return `✅ Completed • [100%] ${bar(100)}`;
  if (state === 'failed') return `❌ Failed • [${pct}%] ${bar(pct)}`;
  if (state === 'timeout') return `⏱️ Timeout • [${pct}%] ${bar(pct)}`;
  return `🔹 Progress • [${pct}%] ${bar(pct)}`;
}

export const ICON = { enroll: '📥', run: '🔹', claim: '🎁' };
