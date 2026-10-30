import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import * as store from '../store.js';
import { theme } from '../themes.js';
import { BRAND, SUPPORT_INVITE, VERSION, SLOTS, AUTHOR } from '../config.js';
import * as api from '../discordApi.js';
import { runQuest, runAll, discover, fill } from '../questEngine.js';
import { isPremium, slots, blockReason } from '../access.js';
import { decrypt, encrypt } from '../crypt.js';

function panelEmbed(id) {
  const u = store.user(id);
  const t = theme(isPremium(id) ? 'premium' : 'free');
  const max = slots(id);
  const lines = [];

  for (let i = 1; i <= max; i++) {
    const acc = u.accounts.find((a) => a.slot === i);
    lines.push(`**#${i} Account Configuration**`);
    if (acc) {
      lines.push(`• ${acc.username || 'Unknown'} (${acc.userId || '—'})`);
      lines.push(`• Status: ${acc.active ? 'Active' : 'Idle'}`);
      lines.push(`• Account Age: ${acc.age || 'N/A'}`);
      lines.push(`• Linked At: <t:${Math.floor(acc.linkedAt / 1000)}:D>`);
    } else {
      lines.push(`• Not Linked (${i > SLOTS.free ? 'Premium Slot' : 'Free Slot'})`);
      lines.push('• Status: Not Active');
      lines.push('• Account Age: N/A');
      lines.push('• Linked At: N/A');
    }
    lines.push('');
  }

  return new EmbedBuilder()
    .setColor(t.color)
    .setTitle(`${t.badge} Account Panel`)
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: t.footer });
}

function panelRows(id) {
  const u = store.user(id);
  const max = slots(id);
  const rows = [];

  const btn = (slot) => {
    const acc = u.accounts.find((a) => a.slot === slot);
    if (acc)
      return [
        new ButtonBuilder()
          .setCustomId(`select:${slot}`)
          .setLabel(`Select #${slot}`)
          .setStyle(acc.active ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`unlink:${slot}`).setLabel(`Unlink #${slot}`).setStyle(ButtonStyle.Danger),
      ];
    return [new ButtonBuilder().setCustomId(`link:${slot}`).setLabel(`Link #${slot}`).setStyle(ButtonStyle.Success)];
  };

  for (let i = 1; i <= max; i += 2) {
    const row = new ActionRowBuilder();
    for (const b of [...btn(i), ...(i + 1 <= max ? btn(i + 1) : [])]) row.addComponents(b);
    if (row.components.length) rows.push(row);
    if (rows.length >= 5) break;
  }
  return rows;
}

const linkModal = (slot) =>
  new ModalBuilder()
    .setCustomId(`modal:token:${slot}`)
    .setTitle(`Link Token for Slot #${slot}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('token')
          .setLabel('Discord Token')
          .setPlaceholder('Paste your Discord token here')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(4000)
          .setRequired(true)
      )
    );

export const list = [
  {
    name: 'help',
    aliases: ['h'],
    description: 'Show all commands and about',
    async run(ctx) {
      const t = theme(isPremium(ctx.user.id) ? 'premium' : 'free');
      const p = isPremium(ctx.user.id) ? ':' : '$';
      const embed = new EmbedBuilder()
        .setColor(t.color)
        .setTitle(`${t.badge} ${BRAND} ${VERSION} Help`)
        .setDescription(
          [
            `**${BRAND} ${VERSION} by ${AUTHOR}**`,
            '',
            '**How to use**',
            '1. Support server join karo',
            `2. \`${p}link\``,
            `3. \`${p}quest\` ya \`${p}questall\``,
            '4. Live logs follow karo',
            '',
            t.div,
            '**About**',
            `• Support: ${SUPPORT_INVITE}`,
            `• Owner: <@985486854159753256>`,
            `• Developer: ${AUTHOR}`,
            '• Quest endpoints Discord ke hain, token private rehta hai.',
          ].join('\n')
        )
        .setFooter({ text: t.footer });

      const menu = new StringSelectMenuBuilder()
        .setCustomId('help:select')
        .setPlaceholder('Select a command')
        .addOptions(
          ['link', 'unlink', 'select', 'quest', 'questall', 'afk', 'orbclaim', 'notifydm', 'checkquests', 'resetlink', 'script', 'botinfo', 'redeem'].map((n) =>
            new StringSelectMenuOptionBuilder().setLabel(n).setValue(n).setDescription(`Details for ${n}`)
          )
        );

      return ctx.reply({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(menu),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Support Server').setURL(SUPPORT_INVITE).setStyle(ButtonStyle.Link)
          ),
        ],
      });
    },
  },
  {
    name: 'link',
    aliases: ['l'],
    description: 'Link a Discord account to a slot',
    async run(ctx) {
      const u = store.user(ctx.user.id);
      const max = slots(ctx.user.id);
      const free = [];
      for (let i = 1; i <= max; i++) if (!u.accounts.find((a) => a.slot === i)) free.push(i);
      if (!free.length) return ctx.reply(`Sab slots bhare hue hain (**${max}**). Pehle \`unlink\` karo.`);
      if (free.length === 1) return ctx.showModal(linkModal(free[0]));
      return ctx.reply({ embeds: [panelEmbed(ctx.user.id)], components: panelRows(ctx.user.id) });
    },
  },
  {
    name: 'unlink',
    description: 'Unlink an account slot',
    async run(ctx) {
      if (!store.user(ctx.user.id).accounts.length) return ctx.reply('Koi account linked nahi hai.');
      return ctx.reply({ embeds: [panelEmbed(ctx.user.id)], components: panelRows(ctx.user.id) });
    },
  },
  {
    name: 'select',
    description: 'Select the active slot',
    async run(ctx) {
      if (!store.user(ctx.user.id).accounts.length) return ctx.reply('Koi account linked nahi hai.');
      return ctx.reply({ embeds: [panelEmbed(ctx.user.id)], components: panelRows(ctx.user.id) });
    },
  },
  {
    name: 'panel',
    description: 'Show your account panel',
    async run(ctx) {
      return ctx.reply({ embeds: [panelEmbed(ctx.user.id)], components: panelRows(ctx.user.id) });
    },
  },
  {
    name: 'quest',
    description: 'Complete one selected quest',
    async run(ctx) {
      const u = store.user(ctx.user.id);
      const active = u.accounts.find((a) => a.active) || u.accounts[0];
      if (!active) return ctx.reply('Pehle `link` se account link karo.');
      const token = decrypt(active.token);
      if (!token) return ctx.reply('Token decrypt fail — dobara link karo.');

      const quests = await discover(token).catch(() => []);
      if (!quests.length) return ctx.reply('Koi available quest nahi mila.');

      const menu = new StringSelectMenuBuilder()
        .setCustomId('quest:pick')
        .setPlaceholder('Select a quest')
        .addOptions(
          quests.slice(0, 25).map((q) =>
            new StringSelectMenuOptionBuilder().setLabel((q.config?.messages?.quest_name || q.id).slice(0, 100)).setValue(q.id)
          )
        );

      const t = theme(isPremium(ctx.user.id) ? 'premium' : 'free');
      return ctx.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(t.color)
            .setTitle(`${t.badge} Select a quest`)
            .setDescription(`${quests.length} quest mile.`)
            .setFooter({ text: t.footer }),
        ],
        components: [new ActionRowBuilder().addComponents(menu)],
      });
    },
  },
  {
    name: 'questall',
    description: 'Enroll and complete every available quest',
    async run(ctx) {
      const u = store.user(ctx.user.id);
      if (store.db_().blacklist.includes(ctx.user.id)) return ctx.reply('Tum blacklist me ho.');
      const active = u.accounts.find((a) => a.active) || u.accounts[0];
      if (!active) return ctx.reply('Pehle `link` se account link karo.');
      const token = decrypt(active.token);
      if (!token) return ctx.reply('Token decrypt fail — dobara link karo.');

      const premium = isPremium(ctx.user.id);
      const t = theme(premium ? 'premium' : 'free');

      await ctx.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(t.color)
            .setTitle(`${t.badge} ${BRAND} ${VERSION} Started`)
            .setDescription(
              [
                premium ? '💎 Premium Overview' : '📘 Standard Overview',
                `Mode: **${t.mode}**`,
                `Parallel: **${premium ? 5 : 2}**`,
                'Video · Mobile · Game · Stream · Achievement — sab handle honge.',
                '',
                'Logs channel me live ja rahe hain.',
              ].join('\n')
            )
            .setFooter({ text: t.footer }),
        ],
      });

      const results = await runAll({ discordId: ctx.user.id, token });
      const ok = results.filter((r) => r.state === 'completed').length;
      const failed = results.filter((r) => r.state !== 'completed');

      const summary = [`✅ **${ok} / ${results.length}** quests complete.`, failed.length ? `❌ Failed: ${failed.length}` : '']
        .filter(Boolean)
        .join('\n');

      await ctx.channel.send(`<@${ctx.user.id}> ${summary}`).catch(() => {});

      const fb = store.cfg().feedback;
      const dmBody = [
        `**${BRAND} ${VERSION} by ${AUTHOR} — summary**`,
        summary,
        '',
        fb ? fill(fb, { user: ctx.user.username, count: ok, total: results.length }) : '',
      ]
        .filter(Boolean)
        .join('\n');

      await ctx.user.send(dmBody).catch(() => {});

      return ctx.followUp({
        embeds: [
          new EmbedBuilder()
            .setColor(ok ? 0x57f287 : 0xed4245)
            .setTitle(`${t.badge} ${BRAND} ${VERSION} Completed`)
            .setDescription(`Solved: **${ok}** / ${results.length}\nFailed: **${results.length - ok}**`)
            .setFooter({ text: t.footer }),
        ],
      });
    },
  },
  {
    name: 'orbclaim',
    description: 'Claim all finished quest rewards',
    async run(ctx) {
      const u = store.user(ctx.user.id);
      const acc = u.accounts.find((a) => a.active) || u.accounts[0];
      if (!acc) return ctx.reply('Pehle account link karo.');
      const token = decrypt(acc.token);
      const res = await api.getQuests(token).catch(() => null);
      const list = Array.isArray(res) ? res : res?.quests || [];
      let claimed = 0;
      for (const q of list) {
        if (q.user_status?.completed_at && !q.user_status?.claimed_at) {
          await api.claim(token, q.id).catch(() => {});
          claimed++;
        }
      }
      return ctx.reply(`🎁 **${claimed}** reward claim kar diye.`);
    },
  },
  {
    name: 'notifydm',
    aliases: ['questnotify', 'disablenotify'],
    description: 'Toggle new-quest DM notifications',
    async run(ctx) {
      if (!isPremium(ctx.user.id)) return ctx.reply(`DM notify sirf premium ke liye. ${blockReason(ctx.user.id)}`);
      const u = store.user(ctx.user.id);
      u.notify = !u.notify;
      store.save(true);
      return ctx.reply(`DM notifications: **${u.notify ? 'ON' : 'OFF'}**`);
    },
  },
  {
    name: 'checkquests',
    description: 'List available quests for your account',
    async run(ctx) {
      const u = store.user(ctx.user.id);
      const acc = u.accounts.find((a) => a.active) || u.accounts[0];
      if (!acc) return ctx.reply('Pehle account link karo.');
      const quests = await discover(decrypt(acc.token)).catch(() => []);
      if (!quests.length) return ctx.reply('Koi available quest nahi.');
      return ctx.reply(quests.slice(0, 20).map((q, i) => `**${i + 1}.** ${q.config?.messages?.quest_name || q.id}`).join('\n'));
    },
  },
  {
    name: 'resetlink',
    description: 'Remove every linked account',
    async run(ctx) {
      store.user(ctx.user.id).accounts = [];
      store.save(true);
      return ctx.reply('Sab accounts unlink kar diye.');
    },
  },
  {
    name: 'script',
    description: 'How the token flow works',
    async run(ctx) {
      return ctx.reply(
        [
          '**Token flow**',
          '1. Browser me Discord kholo',
          '2. `Ctrl+Shift+I` → Application → Local Storage → `token`',
          '3. Copy karke bot me paste karo',
          '4. Token AES-256 se encrypted save hota hai',
          '5. Bot tumhare account se quest enroll/claim karta hai',
        ].join('\n')
      );
    },
  },
  {
    name: 'botinfo',
    description: 'Bot information',
    async run(ctx) {
      const t = theme(isPremium(ctx.user.id) ? 'premium' : 'free');
      return ctx.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(t.color)
            .setTitle(`${t.badge} ${BRAND} ${VERSION} by ${AUTHOR}`)
            .setDescription(`Prefix: \`${isPremium(ctx.user.id) ? ':' : '$'}\`\nSupport: ${SUPPORT_INVITE}\n\`afk\` — 24/7 fake presence`)
            .setFooter({ text: t.footer }),
        ],
      });
    },
  },
  {
    name: 'redeem',
    description: 'Redeem a premium key',
    async run(ctx) {
      return ctx.showModal(
        new ModalBuilder()
          .setCustomId('modal:key')
          .setTitle('Activate Premium')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('key')
                .setLabel('Premium / Trial Key')
                .setPlaceholder('XXXX-XXXX-XXXX')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          )
      );
    },
  },
  {
    name: 'invites',
    description: 'Show your invite progress',
    async run(ctx) {
      const u = store.user(ctx.user.id);
      return ctx.reply(`Invites: **${u.invites.valid}**\n3 invites = 7 din premium\n2 invites = 30 din quest role`);
    },
  },
];

export { linkModal, panelEmbed, panelRows };
