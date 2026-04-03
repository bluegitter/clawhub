---
summary: "Self-hosted Linux deployment for the local backend + TanStack UI using Docker and systemd."
read_when:
  - Deploying ClawHub to a Linux server
  - Migrating local data to a remote host
  - Operating the self-hosted local backend in production-like environments
---

# Self-hosted Linux Server Deployment

This document describes the current self-hosted deployment model for this repo:

- frontend UI via Vite dev server
- local backend via `server/local`
- embedded PostgreSQL managed by the app
- long-running processes supervised by `systemd`
- runtime isolation via Docker `node:22-bookworm`

This is the deployment model used for the server at `192.168.63.50`.

## Ports

- backend: `3001`
- UI: `3003`

Do not assume `3000` is available on shared servers. In our deployment, `3000` and `3002` were already occupied by other services.

## Directory layout

Recommended target path:

```bash
/opt/clawhub
```

Important subdirectories:

- `/opt/clawhub/data/storage` for uploaded skill files
- `/opt/clawhub/data/pg` for the Linux embedded PostgreSQL cluster
- `/opt/clawhub/.env` for runtime configuration

## Runtime requirements

- Linux host with Docker installed
- `systemd`
- outbound network access for pulling `node:22-bookworm`

Host Node.js version does not need to match the project, because the processes run inside Docker. This is useful on older hosts such as CentOS 7 where the system Node is too old.

## Environment variables

Minimum server-side `.env` example:

```env
SSO_BASE_URL=http://192.168.63.22:8091
SSO_LOGIN_URL=http://192.168.63.22:8091/login
SSO_LOGOUT_URL=http://192.168.63.22:8091/logout
SSO_APP_KEY=skillhub
SSO_APP_SECRET=your-secret
SSO_ENABLED=1
LOCAL_AUTH_ENABLED=1

APP_URL=http://192.168.63.50:3003
VITE_APP_URL=http://192.168.63.50:3003
VITE_LOCAL_BACKEND_URL=http://192.168.63.50:3001

CORS_ALLOWED_ORIGINS=http://192.168.63.50:3003,http://192.168.63.50:3001,http://localhost:3000,http://localhost:3001
REDIRECT_ALLOWED_ORIGINS=http://192.168.63.50:3003,http://localhost:3000
```

Notes:

- `CORS_ALLOWED_ORIGINS` controls which browser origins may call the backend with credentials.
- `REDIRECT_ALLOWED_ORIGINS` controls which login/logout callback targets are accepted.
- `APP_URL` must point to the UI entrypoint, not the backend.

## Code sync

From the local workspace:

```bash
ssh 192.168.63.50 'mkdir -p /opt/clawhub'
tar --exclude=.git --exclude=node_modules --exclude=.vite --exclude=.output --exclude=.DS_Store -cf - . \
  | ssh 192.168.63.50 'cd /opt/clawhub && tar xf -'
```

## Install dependencies on the server

Use Docker instead of the host Node:

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

## Data migration

### Important limitation

Do not copy a macOS `data/pg` directory directly to Linux and expect it to work.

Reasons:

- PostgreSQL data directories are not portable across OS/runtime combinations in this setup
- locale configuration differs
- `postgresql.conf` can contain values that are invalid on the target host

### What to migrate

Safe to migrate directly:

- `data/storage`

Do not migrate directly:

- `data/pg`

### Recommended migration flow

1. Copy `data/storage`
2. Export local business data logically from the local database
3. Start the remote Linux backend once with a fresh empty `data/pg`
4. Import the logical snapshot into the fresh Linux cluster

Current business tables:

- `users`
- `sessions`
- `api_tokens`
- `skills`
- `skill_versions`
- `skill_files`
- `stars`
- `skill_embeddings`

The repo includes a snapshot import helper:

- [server/local/scripts/import-local-snapshot.ts](/Users/yanfei/Downloads/clawhub/server/local/scripts/import-local-snapshot.ts)

Example import:

```bash
docker run --rm \
  --user node \
  -v /opt/clawhub:/app \
  -w /app \
  --env-file /opt/clawhub/.env \
  node:22-bookworm \
  bash -lc "./node_modules/.bin/tsx server/local/scripts/import-local-snapshot.ts /app/data/clawhub-local-data.json"
```

## systemd services

Backend service:

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

UI service:

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

Install and start:

```bash
systemctl daemon-reload
systemctl enable clawhub-local-backend.service clawhub-local-ui.service
systemctl restart clawhub-local-backend.service
systemctl restart clawhub-local-ui.service
```

## Validation

Backend:

```bash
curl http://127.0.0.1:3001/api/v1/skills
```

UI:

```bash
curl -I http://127.0.0.1:3003/
```

Service state:

```bash
systemctl status clawhub-local-backend.service --no-pager
systemctl status clawhub-local-ui.service --no-pager
```

## Troubleshooting

### 1. `EACCES: permission denied, lstat 'data/pg'`

Cause:

- synced files changed ownership/mode
- container runs as `node`, but `/opt/clawhub/data` is no longer readable by uid `1000`

Fix:

```bash
chown -R 1000:1000 /opt/clawhub /opt/clawhub/data
find /opt/clawhub/data -type d -exec chmod 755 {} \;
find /opt/clawhub/data -type f -exec chmod 644 {} \;
chmod 700 /opt/clawhub/data/pg
```

### 2. `invalid value for parameter "lc_messages": "en_US.UTF-8"`

Cause:

- stale PostgreSQL config in the Linux data directory

Fix:

```bash
sed -i "s/^lc_messages *= *'en_US.UTF-8'/lc_messages = 'C'/" /opt/clawhub/data/pg/postgresql.conf
systemctl restart clawhub-local-backend.service
```

The backend startup code now also tries to normalize this automatically on Linux.

### 3. UI login succeeds but page still shows logged out

Check:

- `CORS_ALLOWED_ORIGINS` includes the UI origin
- `REDIRECT_ALLOWED_ORIGINS` includes the UI origin
- `APP_URL` points to the UI, not the backend

### 4. SSO callback returns to `localhost:3000`

Cause:

- stale redirect target from earlier local development

Fix:

- set `APP_URL` to the server UI URL
- add the real UI origin to `REDIRECT_ALLOWED_ORIGINS`
- restart backend

### 5. Uploaded `.jsonl` file is rejected as non-text

The upload validators depend on `clawhub-schema/textFiles`. If the server is still using stale artifacts, resync the workspace and restart the UI/backend.

## Operational notes

- This deployment currently uses Vite dev server for the UI, not a production static build.
- The embedded PostgreSQL cluster is local to the app directory and should be backed up as application data.
- If you resync the repo with `tar`, avoid overwriting permissions under `data/` unless you re-apply ownership afterward.
