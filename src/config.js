const parseIds = (v) =>
  (v || '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

export const OWNER_IDS = [...new Set([...parseIds(process.env.OWNER_IDS), ...parseIds(process.env.OWNER_ID), '985486854159753256'])];
export const OWNER_ID = OWNER_IDS[0];
export const OWNER_TAG = OWNER_ID;

export const DEV_NAME = process.env.DEV_NAME || 'shimz';
export const DEV_LINK = process.env.DEV_LINK || 'https://github.com/shimz';
export const AUTHOR = 'shimz';

export const SUPPORT_INVITE = process.env.SUPPORT_INVITE || 'https://discord.gg/codershub';
export const BOT_INVITE =
  process.env.BOT_INVITE ||
  `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID || '1565571186501357568'}&permissions=268435456&scope=bot%20applications.commands`;

export const PREFIX = { free: '$', premium: ':', alt: '!!' };
export const SLOTS = { free: 2, premium: 5 };

export const INVITE_PREMIUM_COUNT = 3;
export const INVITE_PREMIUM_DAYS = 7;
export const QUEST_ROLE_INVITES = 2;
export const QUEST_ROLE_DAYS = 30;

export const VIDEO_TICK = { free: 22000, premium: 14000 };
export const GAME_TICK = 15000;
export const CONCURRENCY = { free: 2, premium: 5 };
export const QUEST_TIMEOUT = { video: 30 * 60 * 1000, game: 45 * 60 * 1000 };
export const JOB_TIMEOUT = 45 * 60 * 1000;

export const BRAND = 'Questall';
export const VERSION = 'V2';
