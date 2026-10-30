import * as store from './store.js';
import { INVITE_PREMIUM_COUNT, INVITE_PREMIUM_DAYS, QUEST_ROLE_INVITES, QUEST_ROLE_DAYS } from './config.js';
import { grantPremium, grantQuestRole, resetInvites, syncRoles } from './access.js';

export const inviteCache = new Map();

export async function snapshot(guild) {
  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return;
  for (const inv of invites.values()) inviteCache.set(inv.code, { uses: inv.uses, inviterId: inv.inviterId });
}

export async function resolveInviter(guild) {
  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return null;
  for (const inv of invites.values()) {
    const prev = inviteCache.get(inv.code);
    inviteCache.set(inv.code, { uses: inv.uses, inviterId: inv.inviterId });
    if (!prev) continue;
    if (inv.uses > prev.uses && inv.inviterId) return inv.inviterId;
  }
  return null;
}

export async function rewardJoin(member, inviterId) {
  if (!inviterId || inviterId === member.id) return;
  const u = store.user(inviterId);
  u.invites.valid += 1;
  u.invites.joiners.push({ id: member.id, at: Date.now() });
  store.save(true);

  if (u.invites.valid >= INVITE_PREMIUM_COUNT) {
    grantPremium(inviterId, INVITE_PREMIUM_DAYS, 'invite');
    resetInvites(inviterId);
    const m = await member.guild.members.fetch(inviterId).catch(() => null);
    if (m) await syncRoles(m);
    await m
      ?.send(`👑 **${INVITE_PREMIUM_COUNT} valid invites!** Tumhe **${INVITE_PREMIUM_DAYS} din ka Premium** mil gaya. Invites reset ho gaye.`)
      .catch(() => {});
    return;
  }

  if (u.invites.valid >= QUEST_ROLE_INVITES && !(u.questRoleUntil > Date.now())) {
    grantQuestRole(inviterId, QUEST_ROLE_DAYS);
    const m = await member.guild.members.fetch(inviterId).catch(() => null);
    if (m) await syncRoles(m);
    await m?.send(`🔹 **${QUEST_ROLE_INVITES} invites!** Quest role **${QUEST_ROLE_DAYS} din** ke liye mil gaya.`).catch(() => {});
  }
}

export async function boostStart(member) {
  grantPremium(member.id, Infinity, 'boost');
  await syncRoles(member);
  await member.send('💎 **Boost detected!** Boost ke jab tak rahega, tumhare paas Premium rahega.').catch(() => {});
}

export async function boostEnd(member) {
  const u = store.user(member.id);
  if (u.premiumReason !== 'boost') return;
  u.premiumUntil = null;
  store.save(true);
  await syncRoles(member);
  await member.send('💎 Boost khatam — premium hat gaya. Dobara boost karo ya 3 invites laao.').catch(() => {});
}
