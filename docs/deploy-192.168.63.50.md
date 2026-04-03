---
summary: "Deployment runbook for the existing self-hosted installation on 192.168.63.50, including all issues encountered during rollout."
read_when:
  - Reproducing or repairing the deployment on 192.168.63.50
  - Understanding why the current ports/env/runtime look the way they do
  - Debugging regressions after resyncing the repo to the server
---

# ClawHub Deployment Record: `192.168.63.50`

This document is not a generic deployment guide.  
It is the actual deployment runbook for the current server:

- server: `192.168.63.50`
- install dir: `/opt/clawhub`
- backend: `http://192.168.63.50:3001`
- UI: `http://192.168.63.50:3003`

Use this document when you need to rebuild, repair, or re-sync this specific machine.

## Final architecture

- source code synced from local workspace to `/opt/clawhub`
- app dependencies installed inside Docker using `node:22-bookworm`
- backend started by `systemd` via Docker
- UI started by `systemd` via Docker
- database is the repo's embedded PostgreSQL cluster under `/opt/clawhub/data/pg`
- uploaded skill files live in `/opt/clawhub/data/storage`
- SSO is enabled and the app entry URL is `http://192.168.63.50:3003`

## Final ports

- `3001`: local backend
- `3003`: UI

These are not arbitrary.

During deployment we confirmed:

- `3000` was already occupied by `chatbot-app`
- `3002` was already occupied by `smart-bi-app`

So the usable pair became:

- backend `3001`
- UI `3003`

## Final `.env`

The deployed server must keep these values in `/opt/clawhub/.env`:

```env
SSO_BASE_URL=http://192.168.63.22:8091
SSO_LOGIN_URL=http://192.168.63.22:8091/login
SSO_LOGOUT_URL=http://192.168.63.22:8091/logout
SSO_APP_KEY=skillhub
SSO_APP_SECRET=...
SSO_ENABLED=1
LOCAL_AUTH_ENABLED=1

APP_URL=http://192.168.63.50:3003
VITE_APP_URL=http://192.168.63.50:3003
VITE_LOCAL_BACKEND_URL=http://192.168.63.50:3001

CORS_ALLOWED_ORIGINS=http://192.168.63.50:3003,http://192.168.63.50:3001,http://localhost:3000,http://localhost:3001
REDIRECT_ALLOWED_ORIGINS=http://192.168.63.50:3003,http://localhost:3000
```

## Why the deployment uses Docker

The host is an older Linux environment. During rollout we confirmed:

- host OS was suitable for Docker + systemd
- host Node.js was too old for this repo

So we did not run the app with the host Node.  
Instead both backend and UI run inside `node:22-bookworm`.

## Code sync command

This was the working repo sync method:

```bash
ssh 192.168.63.50 'mkdir -p /opt/clawhub'
tar --exclude=.git --exclude=node_modules --exclude=.vite --exclude=.output --exclude=.DS_Store -cf - . \
  | ssh 192.168.63.50 'cd /opt/clawhub && tar xf -'
```

Important:

- this command can overwrite `/opt/clawhub/.env` with local values
- it can also disturb ownership/mode under `/opt/clawhub/data`

That happened more than once during this deployment.

## Dependency install command

```bash
ssh 192.168.63.50 '
  cd /opt/clawhub &&
  docker run --rm \
    -v /opt/clawhub:/app \
    -w /app \
    node:22-bookworm \
    bash -lc "npm install --ignore-scripts --legacy-peer-deps"
'
```

## systemd services in use

Backend:

```ini
[Unit]
Description=ClawHub Local Backend
After=network-online.target docker.service
Requires=docker.service

[Service]
Type=simple
Restart=always
RestartSec=5
TimeoutStartSec=0
ExecStartPre=-/usr/bin/docker rm -f clawhub-local-backend
ExecStart=/usr/bin/docker run --rm --name clawhub-local-backend --user node -p 3001:3001 --env-file /opt/clawhub/.env -e PORT=3001 -v /opt/clawhub:/app -w /app node:22-bookworm bash -lc "./node_modules/.bin/tsx server/local/start.ts"
ExecStop=/usr/bin/docker stop clawhub-local-backend

[Install]
WantedBy=multi-user.target
```

UI:

```ini
[Unit]
Description=ClawHub Local UI
After=network-online.target docker.service clawhub-local-backend.service
Requires=docker.service

[Service]
Type=simple
Restart=always
RestartSec=5
TimeoutStartSec=0
ExecStartPre=-/usr/bin/docker rm -f clawhub-local-ui
ExecStart=/usr/bin/docker run --rm --name clawhub-local-ui --user node -p 3003:3000 --env-file /opt/clawhub/.env -v /opt/clawhub:/app -w /app node:22-bookworm bash -lc "./node_modules/.bin/vite --host 0.0.0.0 --port 3000"
ExecStop=/usr/bin/docker stop clawhub-local-ui

[Install]
WantedBy=multi-user.target
```

## Data migration strategy actually used

### What worked

- migrated `data/storage`
- exported database content logically
- re-imported into a fresh Linux-native cluster

### What did not work

Directly copying local macOS `data/pg` to Linux failed.

That was a real deployment blocker.

Root causes:

- embedded PostgreSQL cluster files were not portable as copied
- Linux locale settings differed
- config values generated on one environment were invalid on the other

### Actual import path

1. keep `/opt/clawhub/data/storage`
2. throw away remote Linux `data/pg` when it was based on the copied macOS cluster
3. start Linux backend with fresh `data/pg`
4. import business snapshot via:
   - [server/local/scripts/import-local-snapshot.ts](/Users/yanfei/Downloads/clawhub/server/local/scripts/import-local-snapshot.ts)

## Problems encountered during deployment

This section is the main reason this file exists.

### 1. `3000` was already occupied

Observed:

- `chatbot-app` was already bound to `3000`

Impact:

- UI could not use `3000`

Decision:

- move UI to `3003`

### 2. `3002` was also already occupied

Observed:

- `smart-bi-app` was bound to `3002`

Impact:

- initial fallback plan for UI on `3002` also failed

Decision:

- final UI port became `3003`

### 3. Host Node.js was too old

Observed:

- host runtime was not appropriate for current repo dependencies/tooling

Impact:

- backend/UI could not be safely started with host Node

Decision:

- standardize on Docker `node:22-bookworm`

### 4. Docker image pull/install initially depended on local proxy

Observed:

- remote Docker daemon needed network access through the local machine proxy
- local machine `192.168.20.4:7897` had to allow LAN access

Impact:

- image pulls and dependency installation would fail until proxy access was opened

### 5. Backend cannot run embedded Postgres as root

Observed:

- embedded Postgres refused to start under root

Impact:

- naive root-based service launch failed

Decision:

- run Docker containers with `--user node`
- repair ownership under `/opt/clawhub` to `1000:1000`

### 6. `embedded-postgres` Linux init path was unreliable

Observed:

- package-level `initialise()` failed on Linux even though the bundled `initdb` binary itself worked

Impact:

- backend startup failed at database bootstrap

Fix applied in code:

- added Linux fallback in [server/local/db/index.ts](/Users/yanfei/Downloads/clawhub/server/local/db/index.ts)
- if package init fails, call bundled `initdb` directly

### 7. Schema bootstrap order bug

Observed:

- fresh database bootstrap tried to create `stars` before `skills`

Impact:

- backend failed on first Linux initialization

Fix applied in code:

- reordered table creation in [server/local/db/index.ts](/Users/yanfei/Downloads/clawhub/server/local/db/index.ts)

### 8. `vite.config.ts` still depended on removed `convex` package

Observed:

- UI startup failed with `Cannot find module 'convex'`

Impact:

- `clawhub-local-ui.service` crash-looped

Fix applied in code:

- removed startup-time `convex` package resolution from [vite.config.ts](/Users/yanfei/Downloads/clawhub/vite.config.ts)

### 9. CORS for deployed UI origin was missing

Observed:

- SSO login could complete, but frontend stayed logged out

Impact:

- `/auth/me` from `http://192.168.63.50:3003` did not get valid CORS credential headers

Fix applied:

- moved CORS whitelist into `.env`
- introduced `CORS_ALLOWED_ORIGINS`

### 10. Redirect allowlist was too implicit

Observed:

- old local dev redirect targets such as `localhost:3000` could still leak into login flow

Impact:

- login callback could return to wrong address

Fix applied:

- introduced `REDIRECT_ALLOWED_ORIGINS`

### 11. Remote `.env` was overwritten by repo sync

Observed:

- after a later full repo sync, remote config regressed to:
  - `APP_URL=http://localhost:3000`
  - `VITE_APP_URL=http://localhost:3000`
  - `VITE_LOCAL_BACKEND_URL=http://192.168.20.4:3001`

Impact:

- UI at `192.168.63.50:3003` began redirecting SSO callback traffic back to local dev backend `192.168.20.4:3001`

Resolution:

- reset `/opt/clawhub/.env` to server values
- restart both services

Operational lesson:

- after any full repo re-sync, always re-check `/opt/clawhub/.env`

### 12. `data/pg` ownership and mode regressed after sync/restart

Observed:

- backend failed with:
  - `EACCES: permission denied, lstat 'data/pg'`

Impact:

- backend could not even stat the database directory

Fix:

```bash
chown -R 1000:1000 /opt/clawhub /opt/clawhub/data
find /opt/clawhub/data -type d -exec chmod 755 {} \;
find /opt/clawhub/data -type f -exec chmod 644 {} \;
chmod 700 /opt/clawhub/data/pg
```

### 13. `lc_messages = 'en_US.UTF-8'` broke Linux startup

Observed:

- backend failed with:
  - `invalid value for parameter "lc_messages": "en_US.UTF-8"`
  - `configuration file "/app/data/pg/postgresql.conf" contains errors`

Impact:

- backend crash-looped even after permission fixes

Fix used on the server:

```bash
sed -i "s/^lc_messages *= *'en_US.UTF-8'/lc_messages = 'C'/" /opt/clawhub/data/pg/postgresql.conf
systemctl restart clawhub-local-backend.service
```

Fix applied in code:

- backend startup now tries to normalize this automatically on Linux in [server/local/db/index.ts](/Users/yanfei/Downloads/clawhub/server/local/db/index.ts)

## Recovery checklist after any full re-sync

If the server starts behaving strangely after syncing the repo again, do these checks in order.

### 1. Verify `.env`

```bash
grep -E '^(APP_URL|VITE_APP_URL|VITE_LOCAL_BACKEND_URL|CORS_ALLOWED_ORIGINS|REDIRECT_ALLOWED_ORIGINS)=' /opt/clawhub/.env
```

Expected:

- `APP_URL=http://192.168.63.50:3003`
- `VITE_APP_URL=http://192.168.63.50:3003`
- `VITE_LOCAL_BACKEND_URL=http://192.168.63.50:3001`

### 2. Repair permissions

```bash
chown -R 1000:1000 /opt/clawhub /opt/clawhub/data
find /opt/clawhub/data -type d -exec chmod 755 {} \;
find /opt/clawhub/data -type f -exec chmod 644 {} \;
chmod 700 /opt/clawhub/data/pg
```

### 3. Repair PostgreSQL config if needed

```bash
sed -i "s/^lc_messages *= *'en_US.UTF-8'/lc_messages = 'C'/" /opt/clawhub/data/pg/postgresql.conf
```

### 4. Restart services

```bash
systemctl restart clawhub-local-backend.service
systemctl restart clawhub-local-ui.service
```

### 5. Verify endpoints

```bash
curl http://127.0.0.1:3001/api/v1/skills
curl -I http://127.0.0.1:3003/
```

## Commands used most often on this server

```bash
systemctl status clawhub-local-backend.service --no-pager
systemctl status clawhub-local-ui.service --no-pager

journalctl -u clawhub-local-backend.service -n 100 --no-pager -l
journalctl -u clawhub-local-ui.service -n 100 --no-pager -l

curl http://127.0.0.1:3001/api/v1/skills
curl -I http://127.0.0.1:3003/
```

## Current success criteria

The deployment is healthy when all of these are true:

- `clawhub-local-backend.service` is `active (running)`
- `clawhub-local-ui.service` is `active (running)`
- `http://192.168.63.50:3003` loads the UI
- `http://192.168.63.50:3001/api/v1/skills` returns JSON
- SSO callback resolves through `192.168.63.50:3001`, not `192.168.20.4:3001`
