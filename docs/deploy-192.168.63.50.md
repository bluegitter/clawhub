---
summary: "192.168.63.50 现有自部署实例的部署运行手册，包含本次上线过程中遇到的全部问题。"
read_when:
  - 需要在 192.168.63.50 上重建或修复部署时
  - 需要理解当前端口、环境变量和运行方式为何如此配置时
  - 重新同步仓库到服务器后，需要排查回归问题时
---

# ClawHub 部署记录：`192.168.63.50`

这不是一份通用部署文档。  
它是当前这台服务器的真实部署运行手册：

- 服务器：`192.168.63.50`
- 安装目录：`/opt/clawhub`
- 后端：`http://192.168.63.50:3001`
- UI：`http://192.168.63.50:3003`

当你需要重建、修复或重新同步这台机器时，应优先使用这份文档。

## 最终架构

- 源码从本地工作区同步到 `/opt/clawhub`
- 应用依赖通过 Docker 内的 `node:22-bookworm` 安装
- 后端由 `systemd` 通过 Docker 启动
- UI 由 `systemd` 通过 Docker 启动
- 数据库使用仓库自带的 embedded PostgreSQL 集群，目录在 `/opt/clawhub/data/pg`
- 上传的 skill 文件存放在 `/opt/clawhub/data/storage`
- 已启用 SSO，应用入口地址为 `http://192.168.63.50:3003`

## 最终端口

- `3001`：本地后端
- `3003`：UI

这些端口不是随意选的。

部署过程中确认过：

- `3000` 已经被 `chatbot-app` 占用
- `3002` 已经被 `smart-bi-app` 占用

因此最终可用组合变成：

- 后端 `3001`
- UI `3003`

## 最终 `.env`

部署服务器上的 `/opt/clawhub/.env` 必须保留以下值：

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

## 为什么部署方案使用 Docker

宿主机是较老的 Linux 环境。部署过程中确认：

- 宿主机操作系统适合运行 Docker + systemd
- 宿主机自带的 Node.js 版本不适合当前仓库

所以没有直接用宿主机 Node 跑服务。  
后端和 UI 都统一运行在 `node:22-bookworm` 容器内。

## 代码同步命令

这次实际可用的仓库同步方式如下：

```bash
ssh 192.168.63.50 'mkdir -p /opt/clawhub'
tar --exclude=.git --exclude=node_modules --exclude=.vite --exclude=.output --exclude=.DS_Store -cf - . \
  | ssh 192.168.63.50 'cd /opt/clawhub && tar xf -'
```

注意：

- 这个命令可能会用本地值覆盖 `/opt/clawhub/.env`
- 也可能破坏 `/opt/clawhub/data` 下文件的 owner 或权限

这两个问题在本次部署中都不止出现过一次。

## 依赖安装命令

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

## 当前使用的 systemd 服务

后端：

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

UI：

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

## 实际使用的数据迁移策略

### 有效的方法

- 迁移 `data/storage`
- 通过逻辑导出方式导出数据库内容
- 在 Linux 原生新库中重新导入

### 无效的方法

直接把本地 macOS 的 `data/pg` 拷贝到 Linux 上不可行。

这是本次部署中的一个真实阻塞点。

根因：

- embedded PostgreSQL 集群文件本身不具备这样直接拷贝的可移植性
- Linux 的 locale 配置与本地不同
- 某些在一个环境生成的配置值，在另一个环境下无效

### 实际导入路径

1. 保留 `/opt/clawhub/data/storage`
2. 如果远端 Linux 的 `data/pg` 是从 macOS 直接拷过来的，就丢弃它
3. 让 Linux 后端重新初始化全新的 `data/pg`
4. 再通过下面的脚本导入业务快照：
   - [server/local/scripts/import-local-snapshot.ts](/Users/yanfei/Downloads/clawhub/server/local/scripts/import-local-snapshot.ts)

## 部署过程中遇到的问题

这一节是这份文档存在的主要原因。

### 1. `3000` 已被占用

现象：

- `chatbot-app` 已经绑定了 `3000`

影响：

- UI 不能使用 `3000`

决策：

- 将 UI 改到 `3003`

### 2. `3002` 也已被占用

现象：

- `smart-bi-app` 绑定了 `3002`

影响：

- UI 初始备用端口 `3002` 也不可用

决策：

- 最终 UI 端口定为 `3003`

### 3. 宿主机 Node.js 版本过旧

现象：

- 宿主机运行时不适合当前仓库依赖和工具链

影响：

- 后端和 UI 都不能安全地直接用宿主机 Node 启动

决策：

- 统一改为 Docker `node:22-bookworm`

### 4. Docker 拉镜像和装依赖一开始依赖本地代理

现象：

- 远端 Docker daemon 需要通过本机代理访问网络
- 需要将本机 `192.168.20.4:7897` 打开局域网访问

影响：

- 在放通代理前，拉镜像和安装依赖都会失败

### 5. 后端不能以 root 身份运行 embedded Postgres

现象：

- embedded Postgres 拒绝在 root 下启动

影响：

- 直接用 root 跑服务会失败

决策：

- Docker 容器统一使用 `--user node`
- 修复 `/opt/clawhub` 下文件 owner 为 `1000:1000`

### 6. `embedded-postgres` 在 Linux 上的初始化路径不稳定

现象：

- 包自带的 `initialise()` 在 Linux 上失败
- 但它内部附带的 `initdb` 二进制本身是可用的

影响：

- 后端在数据库初始化阶段启动失败

代码修复：

- 在 [server/local/db/index.ts](/Users/yanfei/Downloads/clawhub/server/local/db/index.ts) 中增加 Linux fallback
- 如果包级 init 失败，则直接调用 bundled `initdb`

### 7. Schema bootstrap 顺序有 bug

现象：

- 全新数据库初始化时，建表顺序里先创建了 `stars`，后创建 `skills`

影响：

- Linux 首次初始化时后端启动失败

代码修复：

- 在 [server/local/db/index.ts](/Users/yanfei/Downloads/clawhub/server/local/db/index.ts) 中调整建表顺序

### 8. `vite.config.ts` 仍然依赖已移除的 `convex` 包

现象：

- UI 启动时报错 `Cannot find module 'convex'`

影响：

- `clawhub-local-ui.service` 反复 crash-loop

代码修复：

- 在 [vite.config.ts](/Users/yanfei/Downloads/clawhub/vite.config.ts) 中去掉启动时对 `convex` 包的解析依赖

### 9. 已部署 UI 的 CORS 白名单缺失

现象：

- SSO 登录虽然完成，但前端仍然显示未登录

影响：

- 从 `http://192.168.63.50:3003` 请求 `/auth/me` 时没有拿到有效的跨域凭据头

修复：

- 将 CORS 白名单迁移到 `.env`
- 引入 `CORS_ALLOWED_ORIGINS`

### 10. Redirect allowlist 过于隐式

现象：

- 旧的本地开发地址 `localhost:3000` 仍可能泄露到登录流程

影响：

- 登录回调可能跳回错误地址

修复：

- 引入 `REDIRECT_ALLOWED_ORIGINS`

### 11. 远端 `.env` 被代码同步覆盖

现象：

- 后续一次全量仓库同步后，远端配置被回退成：
  - `APP_URL=http://localhost:3000`
  - `VITE_APP_URL=http://localhost:3000`
  - `VITE_LOCAL_BACKEND_URL=http://192.168.20.4:3001`

影响：

- `192.168.63.50:3003` 上的 UI 开始把 SSO 回调流量重定向回本地开发后端 `192.168.20.4:3001`

处理方式：

- 重新把 `/opt/clawhub/.env` 改回服务器值
- 重启前后端两个服务

运维结论：

- 每次做全量代码同步后，都必须重新检查 `/opt/clawhub/.env`

### 12. `data/pg` 的 owner 和权限在同步/重启后被破坏

现象：

- 后端报错：
  - `EACCES: permission denied, lstat 'data/pg'`

影响：

- 后端甚至无法 `stat` 数据库目录

修复命令：

```bash
chown -R 1000:1000 /opt/clawhub /opt/clawhub/data
find /opt/clawhub/data -type d -exec chmod 755 {} \;
find /opt/clawhub/data -type f -exec chmod 644 {} \;
chmod 700 /opt/clawhub/data/pg
```

### 13. `lc_messages = 'en_US.UTF-8'` 导致 Linux 启动失败

现象：

- 后端报错：
  - `invalid value for parameter "lc_messages": "en_US.UTF-8"`
  - `configuration file "/app/data/pg/postgresql.conf" contains errors`

影响：

- 即使修好权限，后端仍然 crash-loop

服务器上实际使用的修复命令：

```bash
sed -i "s/^lc_messages *= *'en_US.UTF-8'/lc_messages = 'C'/" /opt/clawhub/data/pg/postgresql.conf
systemctl restart clawhub-local-backend.service
```

代码修复：

- 后端启动时现在会在 Linux 下尝试自动规范化这个配置，见 [server/local/db/index.ts](/Users/yanfei/Downloads/clawhub/server/local/db/index.ts)

## 每次全量重新同步后的恢复检查清单

如果服务器在重新同步仓库后出现异常，按下面顺序检查。

### 1. 检查 `.env`

```bash
grep -E '^(APP_URL|VITE_APP_URL|VITE_LOCAL_BACKEND_URL|CORS_ALLOWED_ORIGINS|REDIRECT_ALLOWED_ORIGINS)=' /opt/clawhub/.env
```

期望值：

- `APP_URL=http://192.168.63.50:3003`
- `VITE_APP_URL=http://192.168.63.50:3003`
- `VITE_LOCAL_BACKEND_URL=http://192.168.63.50:3001`

### 2. 修复权限

```bash
chown -R 1000:1000 /opt/clawhub /opt/clawhub/data
find /opt/clawhub/data -type d -exec chmod 755 {} \;
find /opt/clawhub/data -type f -exec chmod 644 {} \;
chmod 700 /opt/clawhub/data/pg
```

### 3. 如有需要，修复 PostgreSQL 配置

```bash
sed -i "s/^lc_messages *= *'en_US.UTF-8'/lc_messages = 'C'/" /opt/clawhub/data/pg/postgresql.conf
```

### 4. 重启服务

```bash
systemctl restart clawhub-local-backend.service
systemctl restart clawhub-local-ui.service
```

### 5. 检查接口

```bash
curl http://127.0.0.1:3001/api/v1/skills
curl -I http://127.0.0.1:3003/
```

## 这台服务器上最常用的命令

```bash
systemctl status clawhub-local-backend.service --no-pager
systemctl status clawhub-local-ui.service --no-pager

journalctl -u clawhub-local-backend.service -n 100 --no-pager -l
journalctl -u clawhub-local-ui.service -n 100 --no-pager -l

curl http://127.0.0.1:3001/api/v1/skills
curl -I http://127.0.0.1:3003/
```

## 当前成功判定标准

满足以下全部条件时，说明部署是健康的：

- `clawhub-local-backend.service` 为 `active (running)`
- `clawhub-local-ui.service` 为 `active (running)`
- `http://192.168.63.50:3003` 能正常打开 UI
- `http://192.168.63.50:3001/api/v1/skills` 能返回 JSON
- SSO 回调通过的是 `192.168.63.50:3001`，而不是 `192.168.20.4:3001`
