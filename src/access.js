import { OWNER_IDS, SLOTS, PREFIX, QUEST_ROLE_DAYS } from './config.js';
import * as store from './store.js';

export const isOwner = (id) => OWNER_IDS.includes(id);
export const isBlacklisted = (id) => store.db_().blacklist.includes(id);

export function tier(id) {
  if (isOwner(id)) return 'owner';
  const u = store.user(id);
  if (u.premiumLocked) return 'free';
  if (u.premiumUntil && u.premiumUntil > Date.now()) return 'premium';
  return 'free';
}

export const isPremium = (id) => tier(id) === 'premium' || tier(id) === 'owner';
export const slots = (id) => (isPremium(id) ? SLOTS.premium : SLOTS.free);

export function prefixFor(id) {
  if (isOwner(id)) return null;
  return isPremium(id) ? PREFIX.premium : PREFIX.free;
}

export function grantPremium(id, days, reason) {
  const u = store.user(id);
  const base = Math.max(Date.now(), u.premiumUntil || 0);
  u.premiumUntil = days === Infinity ? Infinity : base + days * 86400000;
  u.premiumReason = reason;
  u.premiumLocked = false;
  store.save(true);
}

export function grantQuestRole(id, days = QUEST_ROLE_DAYS) {
  store.user(id).questRoleUntil = Date.now() + days * 86400000;
  store.save(true);
}

export function resetInvites(id) {
  const u = store.user(id);
  u.invites = { valid: 0, joiners: [] };
  u.inviteWindow = Date.now();
  store.save(true);
}

export function blockReason(id) {
  const u = store.user(id);
  if (u.premiumReason === 'boost') return 'tumhara **Server Boost** khatam ho gaya hai — boost wapas karo ya 3 invites laao.';
  if (u.premiumReason === 'invite') return 'premium expire ho gaya aur tumhare paas **enough invites nahi** hain (3 chahiye).';
  if (u.premiumReason === 'key') return 'tumhari **premium key** expire ho gayi. Nayi key redeem karo.';
  return 'ye feature sirf **Premium** users ke liye hai.';
}

export async function syncRoles(member) {
  if (!member) return;
  const conf = store.cfg();
  if (!conf.freeRole || !conf.premiumRole) return;
  const u = store.user(member.id);
  const wantPremium = tier(member.id) === 'premium' || tier(member.id) === 'owner';
  const wantQuestRole = u.questRoleUntil && u.questRoleUntil > Date.now();

  const apply = async (roleId, on) => {
    if (!roleId) return;
    const has = member.roles.cache.has(roleId);
    if (on && !has) await member.roles.add(roleId).catch(() => {});
    if (!on && has) await member.roles.remove(roleId).catch(() => {});
  };

  await apply(conf.premiumRole, wantPremium);
  await apply(conf.freeRole, !wantPremium || wantQuestRole);
}
