import fs from 'node:fs';
import path from 'node:path';

const DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const FILE = path.join(DIR, 'db.json');

const DEFAULT = {
  users: {},
  keys: {},
  jobs: {},
  afk: {},
  blacklist: [],
  config: {
    questChannel: null,
    freeRole: null,
    premiumRole: null,
    aboutChannel: null,
    aboutMessage: null,
    panelMessage: null,
    feedback: null,
  },
};

let db = structuredClone(DEFAULT);
let flush = null;

export function load() {
  fs.mkdirSync(DIR, { recursive: true });
  if (fs.existsSync(FILE)) {
    try {
      db = { ...structuredClone(DEFAULT), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
    } catch {
      db = structuredClone(DEFAULT);
    }
  }
  return db;
}

export function save(immediate = false) {
  const write = () => {
    try {
      fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
    } catch (e) {
      console.error('[store] write failed', e.message);
    }
  };
  if (immediate) return write();
  clearTimeout(flush);
  flush = setTimeout(write, 800);
}

export const db_ = () => db;
export const cfg = () => db.config;

export function user(id) {
  if (!db.users[id]) {
    db.users[id] = {
      tier: 'free',
      premiumUntil: null,
      premiumReason: null,
      premiumLocked: false,
      questRoleUntil: null,
      invites: { valid: 0, joiners: [] },
      inviteWindow: Date.now(),
      notify: true,
      accounts: [],
      usedKeys: [],
      linkedAt: null,
      lastQuestAt: null,
    };
  }
  return db.users[id];
}

export const allUsers = () => Object.entries(db.users);
