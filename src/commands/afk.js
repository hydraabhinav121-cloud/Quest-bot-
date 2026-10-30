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
import { PRESETS, CATS, startAfk, stopAfk } from '../afk.js';
import { decrypt } from '../crypt.js';

function card(id) {
  const e = store.db_().afk[id];
  const t = theme('premium');
  if (!e)
    return new EmbedBuilder()
      .setColor(t.color)
      .setTitle(`${t.badge} AFK Presence`)
      .setDescription('Koi AFK set nahi hai.\nNeeche se category chuno aur apna fake status laga lo.')
      .setFooter({ text: t.footer });

  return new EmbedBuilder()
    .setColor(t.color)
    .setTitle(`${t.badge} AFK Active`)
    .setDescription(
      [
        `• Display: **${e.name}**`,
        `• Type: **${e.type}**`,
        `• Status: **${e.status}**`,
        `• Since: <t:${Math.floor(e.since / 1000)}:R>`,
        '',
        'Presence har 4 min me refresh hoti hai — account 24/7 online rahega.',
      ].join('\n')
    )
    .setFooter({ text: t.footer });
}

function catRows() {
  const row = new ActionRowBuilder();
  for (const [key, label] of Object.entries(CATS))
    row.addComponents(new ButtonBuilder().setCustomId(`afk:cat:${key}`).setLabel(label).setStyle(ButtonStyle.Secondary));
  row.addComponents(new ButtonBuilder().setCustomId('afk:custom').setLabel('✏️ Custom').setStyle(ButtonStyle.Primary));
  return row;
}

export function presetRow(cat) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`afk:pick:${cat}`)
    .setPlaceholder('Select something to show')
    .addOptions(PRESETS[cat].slice(0, 25).map((p) => new StringSelectMenuOptionBuilder().setLabel(p.name.slice(0, 100)).setValue(p.id)));
  return new ActionRowBuilder().addComponents(menu);
}

export function statusRow() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('afk:status')
    .setPlaceholder('Online status')
    .addOptions(['online', 'idle', 'dnd', 'invisible'].map((s) => new StringSelectMenuOptionBuilder().setLabel(s).setValue(s)));
  return new ActionRowBuilder().addComponents(menu);
}

export function customModal() {
  return new ModalBuilder()
    .setCustomId('afk:modal')
    .setTitle('Custom AFK')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('text')
          .setLabel('What should show?')
          .setPlaceholder('Browsing something / Playing something')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(120)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('type')
          .setLabel('playing / watching / listening / custom')
          .setValue('custom')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      )
    );
}

export const list = [
  {
    name: 'afk',
    aliases: ['presence'],
    description: 'Set a fake 24/7 presence (game / anime / site / coding)',
    options: [
      {
        name: 'mode',
        description: 'games | anime | sites | coding | status | stop',
        type: 3,
        required: false,
        choices: [
          { name: 'stop', value: 'stop' },
          { name: 'status', value: 'status' },
          { name: 'games', value: 'games' },
          { name: 'anime', value: 'anime' },
          { name: 'sites', value: 'sites' },
          { name: 'coding', value: 'coding' },
        ],
      },
    ],
    async run(ctx, args) {
      const u = store.user(ctx.user.id);
      if (!u.accounts.length) return ctx.reply('Pehle `link` se account link karo — AFK token se chalta hai.');

      if (args?.mode === 'stop') {
        const acc = u.accounts.find((a) => a.active) || u.accounts[0];
        stopAfk(ctx.user.id, acc ? decrypt(acc.token) : null);
        return ctx.reply('⏹️ AFK band kar diya.');
      }
      if (args?.mode === 'status') return ctx.reply({ embeds: [card(ctx.user.id)], components: [statusRow()] });
      if (args?.mode && PRESETS[args.mode])
        return ctx.reply({
          embeds: [new EmbedBuilder().setColor(0x2b6cff).setTitle(CATS[args.mode]).setDescription('Ek option chuno.')],
          components: [presetRow(args.mode)],
        });

      return ctx.reply({ embeds: [card(ctx.user.id)], components: [catRows(), statusRow()] });
    },
  },
  {
    name: 'afkcustom',
    description: 'Custom AFK text',
    async run(ctx) {
      if (!store.user(ctx.user.id).accounts.length) return ctx.reply('Pehle `link` se account link karo.');
      return ctx.showModal(customModal());
    },
  },
];

export async function handleAfkButton(interaction, action, arg) {
  if (action === 'cat')
    return interaction.update({
      embeds: [new EmbedBuilder().setColor(0x2b6cff).setTitle(CATS[arg]).setDescription('Ek option chuno.')],
      components: [presetRow(arg)],
    });

  if (action === 'custom') return interaction.showModal(customModal());

  if (action === 'stop') {
    const u = store.user(interaction.user.id);
    const acc = u.accounts.find((a) => a.active) || u.accounts[0];
    stopAfk(interaction.user.id, acc ? decrypt(acc.token) : null);
    return interaction.update({ embeds: [card(interaction.user.id)], components: [catRows(), statusRow()] });
  }
}

export { card, catRows };
