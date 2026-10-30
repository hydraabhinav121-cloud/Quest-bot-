import * as api from './discordApi.js';
import * as store from './store.js';
import { theme, statusLine, ICON, bar } from './themes.js';
import { VIDEO_TICK, GAME_TICK, CONCURRENCY, QUEST_TIMEOUT } from './config.js';
import { isPremium } from './access.js';
import { setGame, setStream } from './tokenManager.js';
import { restorePresence } from './afk.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const running = new Set();

let logChannel = null;
export function setLogChannel(ch) {
  logChannel = ch;
}

const tasksOf = (q) => q.config?.task_config_v2?.tasks || q.config?.task_config?.tasks || {};

function primaryTask(q) {
  const tasks = tasksOf(q);
  for (const t of api.TASKS) if (tasks[t]) return { type: t, cfg: tasks[t] };
  return null;
}

export function eligible(q) {
  const us = q.user_status || {};
  if (us.claimed_at || us.completed_at) return false;
  const exp = q.expires_at || q.config?.expires_at;
  if (exp && new Date(exp).getTime() < Date.now()) return false;
  return !!primaryTask(q);
}

export async function discover(token) {
  const res = await api.getQuests(token);
  const list = Array.isArray(res) ? res : res?.quests || [];
  return list.filter(eligible);
}

function statusOf(q) {
  const us = q.user_status || {};
  let done = 0;
  let target = 0;
  for (const p of Object.values(us.progress || {})) {
    done += Number(p?.seconds_done ?? p?.progress ?? 0) || 0;
    target = Math.max(target, Number(p?.target ?? p?.seconds_needed ?? 0) || 0);
  }
  return { done, target, completed: !!us.completed_at, claimed: !!us.claimed_at, enrolled: !!us.enrolled_at };
}

async function refresh(token, questId) {
  try {
    const res = await api.getQuests(token);
    const list = Array.isArray(res) ? res : res?.quests || [];
    const q = list.find((x) => x.id === questId);
    return q ? statusOf(q) : null;
  } catch {
    return null;
  }
}

export function fill(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

export async function runQuest({ discordId, token, quest, fast }) {
  const key = `${discordId}:${quest.id}`;
  if (running.has(key)) return { state: 'skip' };
  running.add(key);

  const t = theme(fast ? 'premium' : 'free');
  const task = primaryTask(quest);
  const type = task?.type || 'WATCH_VIDEO';
  const strategy = api.STRATEGY[type] || 'heartbeat';
  const name = quest.config?.messages?.quest_name || quest.name || quest.id;
  const timeout = strategy === 'heartbeat' ? QUEST_TIMEOUT.video : QUEST_TIMEOUT.game;

  const logMsg = await logChannel
    ?.send({
      embeds: [
        {
          color: t.color,
          title: `${t.badge} ${name}`,
          description: `${ICON.enroll} Enrolled • ${t.mode} • \`${type}\`\n${statusLine('run', 0)}`,
          footer: { text: t.footer },
        },
      ],
    })
    .catch(() => null);

  const update = async (state, pct) => {
    if (!logMsg) return;
    await logMsg
      .edit({
        embeds: [
          {
            color: t.color,
            title: `${t.badge} ${name}`,
            description: `${ICON.enroll} Enrolled • ${t.mode} • \`${type}\`\n${statusLine(state, pct)}`,
            footer: { text: t.footer },
          },
        ],
      })
      .catch(() => {});
  };

  const start = Date.now();
  let pct = 0;

  try {
    if (!statusOf(quest).enrolled) {
      try {
        await api.enroll(token, quest.id);
      } catch (e) {
        if (e.status !== 400) throw e;
      }
    }

    const appId = task?.cfg?.applications?.[0]?.id || quest.config?.application_id;
    const appName = quest.config?.application?.name || name;

    if (strategy === 'game') await setGame(token, appId, appName).catch(() => {});
    else if (strategy === 'stream') await setStream(token, appName).catch(() => {});

    const tick = strategy === 'heartbeat' ? (fast ? VIDEO_TICK.premium : VIDEO_TICK.free) : GAME_TICK;

    while (true) {
      const p = await refresh(token, quest.id);
      if (p) {
        if (p.target > 0) pct = Math.min(99, Math.round((p.done / p.target) * 100));
        if (p.claimed) {
          await update('completed', 100);
          return { state: 'completed', pct: 100 };
        }
        if (p.completed) break;
      }

      await api.heartbeat(token, quest.id, api.randomStreamKey()).catch(() => {});
      await update('run', pct);
      await sleep(tick);

      if (Date.now() - start > timeout) {
        await update('timeout', pct);
        return { state: 'timeout', pct };
      }
    }

    try {
      await api.claim(token, quest.id);
    } catch (e) {
      if (e.status !== 400) {
        await update('failed', pct);
        return { state: 'failed', pct, error: e.message };
      }
    }

    await update('completed', 100);
    return { state: 'completed', pct: 100 };
  } catch (e) {
    await update('failed', pct);
    return { state: 'failed', pct, error: e.message };
  } finally {
    await restorePresence(discordId, token);
    running.delete(key);
    store.user(discordId).lastQuestAt = Date.now();
    delete store.db_().jobs[`${discordId}:${quest.id}`];
    store.save();
  }
}

export async function runAll({ discordId, token }) {
  const fast = isPremium(discordId);
  const quests = await discover(token);
  const limit = Math.max(1, fast ? CONCURRENCY.premium : CONCURRENCY.free);
  const results = [];
  let i = 0;

  const worker = async () => {
    while (i < quests.length) {
      const q = quests[i++];
      store.db_().jobs[`${discordId}:${q.id}`] = { discordId, questId: q.id, startedAt: Date.now() };
      store.save();
      results.push({ quest: q, ...(await runQuest({ discordId, token, quest: q, fast })) });
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, quests.length) }, worker));
  return results;
}

export async function resumeJobs(getToken) {
  for (const job of Object.values(store.db_().jobs)) {
    const token = await getToken(job.discordId);
    if (!token) continue;
    try {
      const res = await api.getQuests(token);
      const list = Array.isArray(res) ? res : res?.quests || [];
      const q = list.find((x) => x.id === job.questId);
      if (q && eligible(q)) runQuest({ discordId: job.discordId, token, quest: q, fast: isPremium(job.discordId) });
    } catch {}
  }
}

export { bar };
