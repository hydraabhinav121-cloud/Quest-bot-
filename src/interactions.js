import { ActionRowBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import * as store from './store.js';
import { encrypt, decrypt } from './crypt.js';
import * as api from './discordApi.js';
import { theme } from './themes.js';
import { SUPPORT_INVITE, OWNER_TAG, BOT_INVITE, AUTHOR } from './config.js';
import { redeem } from './keys.js';
import { syncRoles, slots, isPremium } from './access.js';
import { panelEmbed, panelRows, linkModal } from './commands/user.js';
import { handleAfkButton, statusRow, card } from './commands/afk.js';
import { startAfk, resolvePreset } from './afk.js';
import { runQuest } from './questEngine.js';
import { commands } from './commands/index.js';

const age = (createdAt) => {
  const years = Math.floor((Date.now() - createdAt) / 31557600000);
  return years > 0 ? `${years} years ago` : 'recently';
};

const keyModal = () =>
  new ModalBuilder()
    .setCustomId('modal:key')
    .setTitle('Activate Premium')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('key').setLabel('Premium / Trial Key').setPlaceholder('XXXX-XXXX-XXXX').setStyle(TextInputStyle.Short).setRequired(true)
      )
    );

export async function onButton(interaction) {
  const parts = interaction.customId.split(':');
  const action = parts[0];
  const arg = parts[1];

  if (action === 'afk') return handleAfkButton(interaction, arg, parts[2]);
  if (action === 'link') return interaction.showModal(linkModal(Number(arg)));
  if (action === 'redeem') return interaction.showModal(keyModal());

  if (action === 'unlink') {
    const u = store.user(interaction.user.id);
    u.accounts = u.accounts.filter((a) => a.slot !== Number(arg));
    store.save(true);
    return interaction.update({ embeds: [panelEmbed(interaction.user.id)], components: panelRows(interaction.user.id) });
  }

  if (action === 'select') {
    const u = store.user(interaction.user.id);
    for (const a of u.accounts) a.active = a.slot === Number(arg);
    store.save(true);
    return interaction.update({ embeds: [panelEmbed(interaction.user.id)], components: panelRows(interaction.user.id) });
  }
}

export async function onModal(interaction) {
  if (interaction.customId.startsWith('modal:token:')) {
    const slot = Number(interaction.customId.split(':')[2]);
    await interaction.deferReply({ ephemeral: true });
    const token = interaction.fields.getTextInputValue('token').trim();

    let me;
    try {
      me = await api.getMe(token);
    } catch {
      return interaction.editReply('❌ Token invalid ya expired hai.');
    }

    const u = store.user(interaction.user.id);
    if (u.accounts.find((a) => a.userId === me.id)) return interaction.editReply('Ye account already linked hai.');
    if (slot > slots(interaction.user.id)) return interaction.editReply('Ye slot tumhare tier me nahi hai.');

    u.accounts = u.accounts.filter((a) => a.slot !== slot);
    u.accounts.push({
      slot,
      token: encrypt(token),
      userId: me.id,
      username: me.username,
      age: age(new Date(me.created_at).getTime()),
      linkedAt: Date.now(),
      active: !u.accounts.some((a) => a.active),
    });
    if (!u.linkedAt) u.linkedAt = Date.now();
    store.save(true);

    return interaction.editReply({
      content: `✅ Linked **${me.username}** to slot #${slot}.`,
      embeds: [panelEmbed(interaction.user.id)],
      components: panelRows(interaction.user.id),
    });
  }

  if (interaction.customId === 'modal:key') {
    await interaction.deferReply({ ephemeral: true });
    const res = redeem(interaction.fields.getTextInputValue('key'), interaction.user.id);
    if (!res.ok) return interaction.editReply(`❌ ${res.error}`);
    const m = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
    if (m) await syncRoles(m);
    return interaction.editReply(`🎟️ Key redeemed — **${res.key.infinite ? '∞' : res.key.days} din** premium active.`);
  }

  if (interaction.customId === 'afk:modal') {
    await interaction.deferReply({ ephemeral: true });
    const text = interaction.fields.getTextInputValue('text');
    const raw = (interaction.fields.getTextInputValue('type') || 'custom').toLowerCase();
    const type = ['playing', 'watching', 'listening', 'custom'].includes(raw) ? raw : 'custom';

    const u = store.user(interaction.user.id);
    const acc = u.accounts.find((a) => a.active) || u.accounts[0];
    if (!acc) return interaction.editReply('Pehle account link karo.');

    await startAfk(interaction.user.id, {
      slot: acc.slot,
      kind: 'custom',
      name: text,
      text,
      type,
      status: store.db_().afk[interaction.user.id]?.status || 'online',
    });
    return interaction.editReply({ content: '✅ Custom AFK set.', embeds: [card(interaction.user.id)] });
  }

  if (interaction.customId === 'feedback:modal') {
    await interaction.deferReply({ ephemeral: true });
    store.cfg().feedback = interaction.fields.getTextInputValue('text');
    store.save(true);
    return interaction.editReply('✅ Feedback message save ho gaya — har completion pe jayega.');
  }
}

export async function onSelect(interaction) {
  if (interaction.customId === 'help:select') {
    const name = interaction.values[0];
    const cmd = commands.find((c) => c.name === name);
    const t = theme(isPremium(interaction.user.id) ? 'premium' : 'free');
    return interaction.update({
      embeds: [new EmbedBuilder().setColor(t.color).setTitle(`${t.badge} ${name}`).setDescription(cmd?.description || 'No description').setFooter({ text: t.footer })],
    });
  }

  if (interaction.customId === 'about:select') {
    const map = {
      support: ['Support Server', SUPPORT_INVITE],
      invite: ['Invite Bot', BOT_INVITE],
      owner: ['Owner', `<@${OWNER_TAG}> — \`${OWNER_TAG}\``],
      commands: ['Commands', '`help` se list, owner ke liye `terminal`.'],
    };
    const [title, body] = map[interaction.values[0]];
    return interaction.update({ embeds: [new EmbedBuilder().setColor(0x2b6cff).setTitle(title).setDescription(body).setFooter({ text: `${AUTHOR}` })] });
  }

  if (interaction.customId.startsWith('afk:pick:')) {
    const cat = interaction.customId.split(':')[2];
    const preset = resolvePreset(cat, interaction.values[0]);
    if (!preset) return interaction.update({ content: 'Preset not found.', components: [] });

    const u = store.user(interaction.user.id);
    const acc = u.accounts.find((a) => a.active) || u.accounts[0];
    if (!acc) return interaction.update({ content: 'Pehle account link karo.', components: [] });

    await startAfk(interaction.user.id, {
      slot: acc.slot,
      kind: cat,
      id: preset.id,
      name: preset.name,
      text: preset.text,
      appId: preset.appId,
      type: preset.type || (cat === 'sites' ? 'custom' : 'playing'),
      status: store.db_().afk[interaction.user.id]?.status || 'online',
    });
    return interaction.update({ embeds: [card(interaction.user.id)], components: [] });
  }

  if (interaction.customId === 'afk:status') {
    const e = store.db_().afk[interaction.user.id];
    if (!e) return interaction.update({ content: 'Pehle AFK set karo.', components: [] });
    e.status = interaction.values[0];
    store.save(true);
    await startAfk(interaction.user.id, e);
    return interaction.update({ embeds: [card(interaction.user.id)], components: [statusRow()] });
  }

  if (interaction.customId === 'quest:pick') {
    const questId = interaction.values[0];
    const u = store.user(interaction.user.id);
    const acc = u.accounts.find((a) => a.active) || u.accounts[0];
    if (!acc) return interaction.update({ content: 'Account missing.', components: [] });

    const token = decrypt(acc.token);
    await interaction.update({ content: `Running quest \`${questId}\`…`, components: [] });

    const quests = await api.getQuests(token).catch(() => null);
    const list = Array.isArray(quests) ? quests : quests?.quests || [];
    const quest = list.find((q) => q.id === questId);
    if (!quest) return interaction.followUp('Quest not found.');

    const r = await runQuest({ discordId: interaction.user.id, token, quest, fast: isPremium(interaction.user.id) });
    return interaction.followUp(`Result: **${r.state}** (${r.pct}%)`);
  }
}
