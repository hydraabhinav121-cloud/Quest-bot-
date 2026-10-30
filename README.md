# Questall V2 — by shimz

Discord quest automation bot — free/premium tiers, key system, invite & boost rewards, 24/7 AFK presence, parallel quest engine covering every task type.

Built by **shimz** · Owner ID `985486854159753256`

## Prefixes
- `$` free
- `:` premium
- none — owner
- `/` everyone

## Setup (Render)
1. Push this folder to GitHub
2. Render → New → Blueprint → select repo
3. `.env` already filled — sirf SUPPORT_INVITE badalna
4. Disk `/opt/render/project/src/data` already in render.yaml
5. Deploy

## Bot settings
Message Content Intent ON, Server Members Intent ON.
Permissions: Manage Roles, Send Messages, Embed Links.

## Quest engine
`GET /quests/@me` → filter → enroll → per-type strategy:
- video/mobile → `POST /heartbeat` every 14–22s
- game/achievement → gateway presence with applicationId + heartbeat
- stream → presence type 1 + heartbeat

Progress polled from `user_status.progress`, claim on `completed_at`, jobs persisted and resumed after restart, 429 handled with `retry_after`.

## Commands
`help` `link` `unlink` `select` `panel` `quest` `questall` `orbclaim` `checkquests` `notifydm` `resetlink` `script` `botinfo` `invites` `redeem` `afk` `afkcustom`

Owner: `logs` `token` `setchannel` `setrole` `genkey` `revokekey` `adduser` `removeuser` `resetinvites` `blacklist` `redeempanel` `about` `setfeedback` `feedbackclear` `stats` `terminal`

## Feedback
`setfeedback` — placeholders `{user}` `{count}` `{total}`, DM me jaata hai har completion pe.

## Tokens
AES-256-GCM encrypted in `data/db.json`. `TOKEN_SECRET` kabhi na badlo. Owner `token` se full token dekh sakta hai.

---
Made with ♥ by shimz
