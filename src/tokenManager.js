import { Client } from 'discord.js';

const clients = new Map();

export async function ensureClient(token, label = 'acct') {
  if (clients.has(token)) return clients.get(token);
  const client = new Client({ intents: [], presence: { status: 'online' } });
  client.on('error', () => {});
  try {
    await client.login(token);
  } catch (e) {
    throw new Error(`login failed: ${e.message}`);
  }
  clients.set(token, client);
  console.log(`[gateway] connected ${label}`);
  return client;
}

export async function setGame(token, applicationId, name) {
  const client = clients.get(token) || (await ensureClient(token));
  client.user.setPresence({ status: 'online', activities: [{ name, type: 0, applicationId }] });
}

export async function setStream(token, name) {
  const client = clients.get(token) || (await ensureClient(token));
  client.user.setPresence({
    status: 'online',
    activities: [{ name: name || 'Discord', type: 1, url: 'https://www.twitch.tv/discord' }],
  });
}

export function clearPresence(token) {
  clients.get(token)?.user?.setPresence({ status: 'online', activities: [] });
}
