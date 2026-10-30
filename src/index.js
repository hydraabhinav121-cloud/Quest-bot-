import 'dotenv/config';
import './health.js';
import { Client, GatewayIntentBits, Partials, Collection, ActivityType } from 'discord.js';
import * as store from './store.js';
import { commands, find } from './commands/index.js';
import { PREFIX, BRAND, VERSION, AUTHOR } from './config.js';
import { isOwner, isPremium, isBlacklisted, syncRoles } from './access.js';
import { decrypt } from './crypt.js';
import { setLogChannel, resumeJobs, discover } from './questEngine.js';
import { onButton, onModal, onSelect } from './interactions.js';
import { buildSlash } from './slash.js';
import { snapshot, resolveInviter, rewardJoin, boostStart, boostEnd } from './invites.js';
import { resumeAllAfk, afkSweep } from './afk.js';

store.load();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
});

client.commands = new Collection(commands.map((c) => [c.name, c]));

const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

process.on('unhandledRejection', (e) => log('unhandledRejection', e?.message || e));
process.on('uncaughtException', (e) => log('uncaughtException', e?.message || e));

function makeCtx(message, command) {
  const args = {};
  const words = message.content.trim().split(/\s+/).slice(1);
  (command.options || []).forEach((opt, i) => {
    if (opt.type === 7 || opt.type === 6 || opt.type === 8) {
      const id = words[i]?.replace(/[<@#&!>]/g, '');
      if (opt.type === 7) args[opt.name] = message.guild?.channels.cache.get(id);
      if (opt.type === 8) args[opt.name] = message.guild?.roles.cache.get(id);
      if (opt.type === 6) args[opt.name] = { id };
    } else if (opt.type === 4) args[opt.name] = Number(words[i]);
    else args[opt.name] = words[i];
  });

  return {
    user: message.author,
    guild: message.guild,
    member: message.member,
    channel: message.channel,
    bot: client,
    reply: (p) => message.reply(typeof p === 'string' ? { content: p } : p),
    followUp: (p) => message.reply(typeof p === 'string' ? { content: p } : p),
    showModal: async () => message.reply('Modal sirf slash se khulta hai — `/link` use karo.'),
  };
}

function makeSlashCtx(interaction) {
  const args = {};
  for (const opt of interaction.options?.data || []) {
    const v = interaction.options.get(opt.name);
    if (opt.type === 7) args[opt.name] = v?.channel;
    else if (opt.type === 6) args[opt.name] = v?.user;
    else if (opt.type === 8) args[opt.name] = v?.role;
    else args[opt.name] = v?.value;
  }
  return {
    user: interaction.user,
    guild: interaction.guild,
    member: interaction.member,
    channel: interaction.channel,
    bot: client,
    reply: (p) => {
      if (interaction.deferred) return interaction.editReply(p);
      if (interaction.replied) return interaction.followUp(p);
      return interaction.reply(p);
    },
    followUp: (p) => interaction.followUp(p),
    showModal: (m) => interaction.showModal(m),
  };
}

client.once('ready', async () => {
  log(`${BRAND} ${VERSION} by ${AUTHOR} online as ${client.user.tag}`);

  const ch = store.cfg().questChannel;
  if (ch) {
    const channel = await client.channels.fetch(ch).catch(() => null);
    if (channel) setLogChannel(channel);
  }

  for (const guild of client.guilds.cache.values()) await snapshot(guild);

  client.user.setPresence({
    status: 'online',
    activities: [{ name: `${BRAND} ${VERSION} by ${AUTHOR} • /help`, type: ActivityType.Watching }],
  });

  const payload = buildSlash();
  if (process.env.GUILD_ID) {
    await client.application.commands
      .set(payload, process.env.GUILD_ID)
      .then(() => log(`registered ${payload.length} slash commands`))
      .catch((e) => log('slash register failed', e.message));
  } else {
    await client.application.commands.set(payload).catch(() => {});
  }

  await resumeJobs(async (id) => {
    const u = store.user(id);
    const acc = u.accounts.find((a) => a.active) || u.accounts[0];
    return acc ? decrypt(acc.token) : null;
  });

  await resumeAllAfk();
  setInterval(() => afkSweep().catch(() => {}), 5 * 60_000);
  setInterval(tick, 60_000);
  setInterval(notifyLoop, 10 * 60_000);
  log('loops started');
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const owner = isOwner(message.author.id);
  const prefixes = [PREFIX.premium, PREFIX.free, PREFIX.alt];

  let content = null;
  if (owner) {
    const p = prefixes.find((x) => message.content.startsWith(x));
    content = p ? message.content.slice(p.length) : message.content;
  } else {
    const p = isPremium(message.author.id) ? [PREFIX.premium, PREFIX.alt] : [PREFIX.free, PREFIX.alt];
    const hit = p.find((x) => message.content.startsWith(x));
    if (hit) content = message.content.slice(hit.length);
  }
  if (!content || !content.trim()) return;

  const [name, ...rest] = content.trim().split(/\s+/);
  const command = find(name.toLowerCase());
  if (!command) return;

  if (command.ownerOnly && !owner) return message.reply('❌ Owner only command.').catch(() => {});
  if (isBlacklisted(message.author.id) && !owner) return message.reply('❌ Tum blacklisted ho.').catch(() => {});

  message.content = `${name} ${rest.join(' ')}`.trim();
  try {
    await command.run(makeCtx(message, command));
  } catch (e) {
    log('cmd error', e.message);
    message.reply(`⚠️ ${e.message}`).catch(() => {});
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton()) return await onButton(interaction);
    if (interaction.isModalSubmit()) return await onModal(interaction);
    if (interaction.isStringSelectMenu()) return await onSelect(interaction);

    if (interaction.isChatInputCommand()) {
      const command = find(interaction.commandName);
      if (!command) return;
      const owner = isOwner(interaction.user.id);

      if (command.ownerOnly && !owner) return interaction.reply({ content: '❌ Owner only.', ephemeral: true });
      if (isBlacklisted(interaction.user.id) && !owner) return interaction.reply({ content: '❌ Blacklisted.', ephemeral: true });

      if (!command.modal) await interaction.deferReply().catch(() => {});
      return await command.run(makeSlashCtx(interaction));
    }
  } catch (e) {
    log('interaction error', e.message);
    if (interaction.isRepliable()) {
      const body = { content: `⚠️ ${e.message}`, ephemeral: true };
      if (interaction.deferred) interaction.editReply(body).catch(() => {});
      else if (!interaction.replied) interaction.reply(body).catch(() => {});
    }
  }
});

client.on('guildMemberAdd', async (member) => {
  const inviter = await resolveInviter(member.guild);
  if (inviter) await rewardJoin(member, inviter);
  await syncRoles(member);
});

client.on('guildMemberRemove', async (member) => {
  for (const [, u] of Object.entries(store.db_().users)) {
    if (u.invites.joiners.some((x) => x.id === member.id)) {
      u.invites.joiners = u.invites.joiners.filter((x) => x.id !== member.id);
      u.invites.valid = Math.max(0, u.invites.valid - 1);
      store.save();
    }
  }
});

client.on('guildMemberUpdate', async (oldM, newM) => {
  const was = !!oldM.premiumSince;
  const now = !!newM.premiumSince;
  if (!was && now) await boostStart(newM);
  if (was && !now) await boostEnd(newM);
});

async function tick() {
  const now = Date.now();
  for (const [id, u] of Object.entries(store.db_().users)) {
    let dirty = false;
    if (u.premiumUntil && u.premiumUntil !== Infinity && u.premiumUntil < now) {
      u.premiumUntil = null;
      dirty = true;
      const m = await client.guilds.cache.first()?.members.fetch(id).catch(() => null);
      if (m) {
        await syncRoles(m);
        m.send('⌛ Premium expire ho gaya — 3 invites ya nayi key chahiye.').catch(() => {});
      }
    }
    if (u.questRoleUntil && u.questRoleUntil < now) {
      u.questRoleUntil = null;
      dirty = true;
      const m = await client.guilds.cache.first()?.members.fetch(id).catch(() => null);
      if (m) await syncRoles(m);
    }
    if (dirty) store.save();
  }
}

async function notifyLoop() {
  for (const [id, u] of Object.entries(store.db_().users)) {
    if (!u.notify || !u.premiumUntil || u.premiumUntil < Date.now()) continue;
    const acc = u.accounts.find((a) => a.active) || u.accounts[0];
    if (!acc) continue;
    const token = decrypt(acc.token);
    if (!token) continue;
    const quests = await discover(token).catch(() => []);
    const fresh = quests.filter((q) => !q.user_status?.enrolled_at).slice(0, 5);
    if (!fresh.length) continue;
    const user = await client.users.fetch(id).catch(() => null);
    user?.send(`📜 **New quests detected**\n${fresh.map((q) => `• ${q.config?.messages?.quest_name || q.id}`).join('\n')}\n\n\`:questall\` chala do.`).catch(() => {});
  }
}

client.login(process.env.BOT_TOKEN).catch((e) => {
  console.error('login failed:', e.message);
  if (String(e.message).includes('disallowed intents'))
    console.error('>>> Developer Portal me Message Content + Server Members intent ON karo');
  process.exit(1);
});
