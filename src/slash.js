import { commands } from './commands/index.js';

export const buildSlash = () => commands.map((c) => ({ name: c.name, description: c.description, options: c.options || [] }));
