# Local HTTPS over LAN IP

This setup keeps the app on the LAN IP `192.168.20.4`, but moves the browser-facing URLs to HTTPS so Convex Auth cookies can survive the OAuth round-trip.

## URLs

- App: `https://192.168.20.4:3443`
- Convex client/API proxy: `https://192.168.20.4:8443`
- Convex Auth proxy: `https://192.168.20.4:8444`

## Local services behind Caddy

- `127.0.0.1:3001` -> Vite app
- `127.0.0.1:3210` -> Convex local backend
- `127.0.0.1:3211` -> Convex Auth local HTTP service

## Repo config

`.env.local` is wired to the HTTPS proxy URLs:

```bash
VITE_SITE_URL=https://192.168.20.4:3443
SITE_URL=https://192.168.20.4:3443
VITE_CONVEX_URL=https://192.168.20.4:8443
VITE_CONVEX_SITE_URL=https://192.168.20.4:8443
CONVEX_SITE_URL=https://192.168.20.4:8444
```

Convex backend env should use:

```bash
bunx convex env set SITE_URL https://192.168.20.4:3443
bunx convex env set CUSTOM_AUTH_SITE_URL https://192.168.20.4:8444
```

## GitHub OAuth App

Use these exact values:

- Homepage URL: `https://192.168.20.4:3443`
- Authorization callback URL: `https://192.168.20.4:8444/api/auth/callback/github`

## Caddy

Config file: [`dev/Caddyfile.local-ip`](../dev/Caddyfile.local-ip)

Start Caddy:

```bash
caddy run --config dev/Caddyfile.local-ip
```

## Trust

`tls internal` makes Caddy issue a certificate from its local CA.

Every browser/device that opens the site must trust that CA, otherwise HTTPS will still show certificate warnings and OAuth/cookies may fail.

On the machine running Caddy, trust the CA with:

```bash
caddy trust
```

For other devices on the LAN, export/import the Caddy local root CA from Caddy's data directory and mark it trusted in the target OS/browser trust store.

## Startup order

1. `bunx convex dev --typecheck=disable`
2. `bunx vite dev --port 3001 --host 0.0.0.0`
3. `caddy run --config dev/Caddyfile.local-ip`

## Notes

- This uses high ports to avoid requiring root privileges for `443`.
- If you later want `https://192.168.20.4` without `:3443`, front it with Caddy on `443`.
