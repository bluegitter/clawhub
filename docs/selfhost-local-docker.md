# Self-host Local Deployment via Docker

This mode runs the app and Convex local deployment together inside one container.

## Public ports

- Web app: `8081`
- Convex local backend: `3210`
- Convex auth/site HTTP: `3211`

## Build args

Use server-specific public URLs when building:

```bash
docker build -f Dockerfile.selfhost-local \
  --build-arg VITE_SITE_URL=http://192.168.14.162:8081 \
  --build-arg SITE_URL=http://192.168.14.162:8081 \
  --build-arg VITE_CONVEX_URL=http://192.168.14.162:3210 \
  --build-arg VITE_CONVEX_SITE_URL=http://192.168.14.162:3210 \
  --build-arg CONVEX_SITE_URL=http://192.168.14.162:3211 \
  -t clawdhub:selfhost-local .
```

## Run

Persist local Convex state:

```bash
docker run -d \
  --name clawdhub \
  --restart unless-stopped \
  -p 8081:8081 \
  -p 3210:3210 \
  -p 3211:3211 \
  -v /opt/clawdhub/data/.convex/local:/app/.convex/local \
  clawdhub:selfhost-local
```

## Notes

- This is a local-deployment style runtime, not a standard cloud Convex production deployment.
- OAuth on plain HTTP may still hit browser cookie restrictions. For reliable login/publish flows, front it with HTTPS.
