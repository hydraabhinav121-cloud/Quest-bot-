import * as user from './user.js';
import * as owner from './owner.js';
import * as afk from './afk.js';

export const commands = [...user.list, ...owner.list, ...afk.list];

export const find = (name) => commands.find((c) => c.name === name || c.aliases?.includes(name));
