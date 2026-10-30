import * as store from './store.js';
import { ensureClient, clearPresence } from './tokenManager.js';
import { decrypt } from './crypt.js';

export const PRESETS = {
  games: [
    { id: 'gta5', name: 'Grand Theft Auto V', appId: '356875057940791296' },
    { id: 'mc', name: 'Minecraft', appId: '356875221061156867' },
    { id: 'palworld', name: 'Palworld' },
    { id: 'valorant', name: 'VALORANT' },
    { id: 'cs2', name: 'Counter-Strike 2' },
    { id: 'fortnite', name: 'Fortnite' },
    { id: 'roblox', name: 'Roblox' },
    { id: 'elden', name: 'ELDEN RING' },
    { id: 'cyberpunk', name: 'Cyberpunk 2077' },
    { id: 'freefire', name: 'Free Fire' },
    { id: 'pubg', name: 'PUBG: BATTLEGROUNDS' },
    { id: 'cod', name: 'Call of Duty' },
  ],
  anime: [
    { id: 'aot', name: 'Attack on Titan', type: 'watching' },
    { id: 'naruto', name: 'Naruto Shippuden', type: 'watching' },
    { id: 'onepiece', name: 'One Piece', type: 'watching' },
    { id: 'demonslayer', name: 'Demon Slayer', type: 'watching' },
    { id: 'jjk', name: 'Jujutsu Kaisen', type: 'watching' },
    { id: 'deathnote', name: 'Death Note', type: 'watching' },
    { id: 'chainsawman', name: 'Chainsaw Man', type: 'watching' },
    { id: 'sololeveling', name: 'Solo Leveling', type: 'watching' },
    { id: 'bleach', name: 'Bleach', type: 'watching' },
    { id: 'tokyoghoul', name: 'Tokyo Ghoul', type: 'watching' },
    { id: 'onepunch', name: 'One Punch Man', type: 'watching' },
    { id: 'dragonball', name: 'Dragon Ball Z', type: 'watching' },
  ],
  sites: [
    { id: 'yt', name: 'YouTube', text: 'Browsing YouTube' },
    { id: 'twitch', name: 'Twitch', text: 'Watching Twitch' },
    { id: 'ph', name: 'Pornhub', text: 'Browsing Pornhub' },
    { id: 'gh', name: 'GitHub', text: 'Browsing GitHub' },
    { id: 'so', name: 'Stack Overflow', text: 'Browsing Stack Overflow' },
    { id: 'reddit', name: 'Reddit', text: 'Browsing Reddit' },
    { id: 'x', name: 'X', text: 'Browsing X' },
    { id: 'insta', name: 'Instagram', text: 'Browsing Instagram' },
    { id: 'netflix', name: 'Netflix', text: 'Watching Netflix' },
    { id: 'spotify', name: 'Spotify', text: 'Listening on Spotify' },
  ],
  coding: [
    { id: 'vscode', name: 'Visual Studio Code', appId: '383226320970055681' },
    { id: 'cursor', name: 'Cursor' },
    { id: 'neovim', name: 'Neovim', appId: '822077458378883082' },
    { id: 'idea', name: 'IntelliJ IDEA', appId: '404181211966341122' },
    { id: 'pycharm', name: 'PyCharm', appId: '404182209085915146' },
    { id: 'sublime', name: 'Sublime Text', appId: '404183241947758592' },
    { id: 'term', name: 'Terminal', appId: '823382059343077417' },
  ],
};

export const CATS = { games: '🎮 Games', anime: '📺 Anime', sites: '🌐 Websites', coding: '💻 Coding' };

export const resolvePreset = (cat, id) => (PRESETS[cat] || []).find((p) => p.id === id) || null;

function getToken(userId, slot) {
  const u = store.user(userId);
  const acc = u.accounts.find((a) => a.slot === slot) || u.accounts.find((a) => a.active) || u.accounts[0];
  return acc ? decrypt(acc.token) : null;
}

function activityFor(entry) {
  if (entry.type === 'watching') return { name: entry.name, type: 3 };
  if (entry.type === 'custom') return { name: entry.text, type: 4, state: entry.text };
  if (entry.type === 'listening') return { name: entry.name, type: 2 };
  if (entry.type === 'streaming') return { name: entry.name, type: 1, url: entry.url || 'https://www.twitch.tv/discord' };
  return { name: entry.name, type: 0, applicationId: entry.appId || undefined };
}

const timers = new Map();

async function apply(userId) {
  const entry = store.db_().afk[userId];
  if (!entry) return false;
  const token = getToken(userId, entry.slot);
  if (!token) return false;
  try {
    const client = await ensureClient(token, `afk-${userId}`);
    client.user.setPresence({ status: entry.status || 'online', activities: [activityFor(entry)] });
    return true;
  } catch {
    return false;
  }
}

export async function startAfk(userId, entry) {
  store.db_().afk[userId] = { ...entry, since: Date.now() };
  store.save(true);
  await apply(userId);
  clearInterval(timers.get(userId));
  timers.set(userId, setInterval(() => apply(userId).catch(() => {}), 4 * 60 * 1000));
  return true;
}

export function stopAfk(userId, token) {
  clearInterval(timers.get(userId));
  timers.delete(userId);
  delete store.db_().afk[userId];
  store.save(true);
  if (token) clearPresence(token);
}

export async function resumeAllAfk() {
  for (const userId of Object.keys(store.db_().afk)) {
    await apply(userId);
    clearInterval(timers.get(userId));
    timers.set(userId, setInterval(() => apply(userId).catch(() => {}), 4 * 60 * 1000));
  }
}

export async function afkSweep() {
  for (const userId of Object.keys(store.db_().afk)) await apply(userId).catch(() => {});
}

export async function restorePresence(userId, token) {
  if (!store.db_().afk[userId]) {
    if (token) clearPresence(token);
    return;
  }
  await apply(userId);
}
