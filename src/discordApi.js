const BASE = 'https://discord.com/api/v10';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export class ApiError extends Error {
  constructor(msg, status, body) {
    super(msg);
    this.status = status;
    this.body = body;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(token, method, path, body, attempt = 0) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: token,
      'User-Agent': UA,
      'Content-Type': 'application/json',
      'X-Discord-Locale': 'en-US',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 429 && attempt < 5) {
    let wait = 1200 * (attempt + 1);
    try {
      const j = await res.clone().json();
      if (j.retry_after) wait = Math.round(j.retry_after * 1000) + 300;
    } catch {}
    await sleep(wait);
    return call(token, method, path, body, attempt + 1);
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) throw new ApiError(data?.message || `HTTP ${res.status}`, res.status, data);
  return data;
}

export const getMe = (token) => call(token, 'GET', '/users/@me');
export const getQuests = (token) => call(token, 'GET', '/quests/@me');
export const enroll = (token, id) => call(token, 'POST', `/quests/${id}/enroll`, {});
export const heartbeat = (token, id, streamKey) => call(token, 'POST', `/quests/${id}/heartbeat`, { stream_key: streamKey });
export const claim = (token, id) => call(token, 'POST', `/quests/${id}/claim`, {});

export const randomStreamKey = () =>
  Array.from({ length: 32 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');

export const TASKS = [
  'WATCH_VIDEO',
  'WATCH_VIDEO_ON_MOBILE',
  'PLAY_ON_DESKTOP',
  'PLAY_ACTIVITY',
  'STREAM_ON_DESKTOP',
  'ACHIEVEMENT_IN_ACTIVITY',
];

export const STRATEGY = {
  WATCH_VIDEO: 'heartbeat',
  WATCH_VIDEO_ON_MOBILE: 'heartbeat',
  STREAM_ON_DESKTOP: 'stream',
  PLAY_ON_DESKTOP: 'game',
  PLAY_ACTIVITY: 'game',
  ACHIEVEMENT_IN_ACTIVITY: 'game',
};
