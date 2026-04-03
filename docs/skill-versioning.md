---
summary: "Self-hosted skill 多版本管理设计：数据库建模、版本生命周期、API 与一致性规则。"
read_when:
  - 设计或扩展 skill 多版本管理
  - 调整本地版 skill 数据库 schema
  - 实现版本列表、diff、tag、rename、删除版本
---

# Skill 多版本管理设计

## 目标

本地版 ClawHub 的 skill 版本管理需要覆盖原版最核心的能力：

- 一个 skill 可以持续发布多个版本
- 可以查看历史版本列表
- 可以浏览某个版本的文件集合
- 可以对比任意两个版本
- 可以给具体版本打标签，例如 `latest`、`stable`、`beta`
- 可以删除单个历史版本
- 可以重命名 skill slug，同时保留旧 slug 跳转能力

设计重点不是“把所有信息堆到一张表”，而是把：

- skill 的稳定身份
- 某次发布生成的版本快照
- 版本内的文件清单
- tag 到版本的映射
- 旧 slug 到当前 canonical skill 的映射

拆成独立结构。这样版本管理、diff、重命名、下载、兼容旧链接才能稳定工作。

## 设计原则

- skill 是长期存在的逻辑实体，版本只是该实体的时间切片
- 每次发布都生成不可变的版本快照
- tag 绑定到具体版本，不绑定到 skill 元数据字符串
- 文件记录属于版本，不属于 skill
- slug 可以变，但 skill 的主键不变
- 旧 slug 不直接删除，而是转换成 alias/redirect 记录

## 核心数据模型

当前本地版的核心表如下：

- [skills](./server/local/db/schema/skills.ts)
- [skillVersions](./server/local/db/schema/skillVersions.ts)
- [skillFiles](./server/local/db/schema/skillFiles.ts)
- [skillVersionTags](./server/local/db/schema/skillVersionTags.ts)
- [skillAliases](./server/local/db/schema/skillAliases.ts)

逻辑关系如下：

```text
users
  └─< skills
        ├─< skill_versions
        │     └─< skill_files
        ├─< skill_version_tags
        └─< skill_aliases
```

### 1. `skills`

职责：保存 skill 的稳定身份和当前展示态。

关键字段：

- `id`: skill 的稳定主键
- `slug`: 当前 canonical slug
- `owner_id`: 所有者
- `name`: 展示名
- `summary`: 摘要
- `description`: 描述
- `latest_version`: 当前默认版本号
- `visibility`: 可见性
- `tags`: 兼容字段，保留轻量标签信息
- `created_at` / `updated_at`

为什么单独保留 `latest_version`：

- 列表页、详情页、下载默认版本都需要快速拿到“当前版本”
- 不需要每次都扫 `skill_versions` 再做一次排序/聚合

`skills` 这张表表达的是“当前 skill 是什么”，不是“历史上每次发布了什么”。

### 2. `skill_versions`

职责：记录 skill 的每一次发布快照。

关键字段：

- `id`: 版本记录主键
- `skill_id`: 所属 skill
- `version`: 版本号，例如 `1.0.0`
- `changelog`: 本次版本变更说明
- `file_size`: 版本总文件体积
- `file_count`: 版本文件数
- `storage_path`: 该版本 zip 或根目录存储位置
- `created_at`

设计要点：

- `skill_id + version` 在业务上应唯一
- 版本记录一旦发布，默认视为不可变
- diff、下载、历史文件浏览都基于这张表展开

这张表的存在，使我们不需要把整份文件内容塞回 `skills` 主表。

### 3. `skill_files`

职责：记录某个版本下的文件清单。

关键字段：

- `version_id`: 所属版本
- `filename`: 文件路径
- `storage_path`: 文件实际存储路径
- `sha256`: 内容摘要
- `size`: 文件大小

为什么要把文件拆成子表：

- 版本 diff 需要按文件路径做 union
- 文件浏览需要列目录/文件
- 删除单版本时要能精确清理该版本文件记录

如果把文件清单塞进 `skill_versions` 的 JSON 字段里，可读性和查询能力都会更差。

### 4. `skill_version_tags`

职责：把 tag 显式绑定到某个版本。

关键字段：

- `skill_id`
- `version_id`
- `tag`
- `created_at`
- `updated_at`

唯一约束：

- `skill_id + tag` 唯一

这意味着：

- 同一个 skill 下，`latest` 只能指向一个版本
- `stable`、`beta` 也只能各自指向一个版本
- 改 tag 本质上是重定向 tag 到另一个 `version_id`

为什么不能只用 `skills.tags text[]`：

- `text[]` 只能表达“skill 有哪些标签”
- 不能表达“哪个 tag 指向哪个版本”
- 原版的 compare/default selection 依赖的是 `tag -> version`

所以真正的多版本管理，必须把 tag 做成关系表。

### 5. `skill_aliases`

职责：维护旧 slug 到当前 skill 的映射。

关键字段：

- `source_slug`: 旧 slug
- `target_skill_id`: 指向当前 canonical skill
- `created_at`

唯一约束：

- `source_slug` 唯一

用途：

- rename 后旧地址仍可访问
- 旧下载链接、旧详情页链接可以自动跳到新 slug
- 避免 rename 之后历史分享链接全部失效

## 版本生命周期设计

### 发布新版本

发布流程对应 [server/local/services/skill.ts](./server/local/services/skill.ts) 的 `publishSkillVersion()`。

建议的生命周期如下：

1. 校验用户是否为 owner
2. 校验 slug 是否存在
3. 如果不存在则创建 `skills`
4. 创建一条新的 `skill_versions`
5. 为该版本写入所有 `skill_files`
6. 更新 `skills.latest_version`
7. 根据发布参数写入/重写 `skill_version_tags`
8. 更新 `skills.summary`、`skills.name`、`updated_at`

其中第 6 步和第 7 步不能省略：

- 不更新 `latest_version`，列表页默认版本会失真
- 不更新 `skill_version_tags`，`latest/stable` 会失真

### 浏览版本

浏览版本通常有三类读取：

- skill 当前详情
- 版本列表
- 单版本详情

推荐读取策略：

- 详情页先查 `skills`
- 再按 `skill_id` 查 `skill_versions`
- tag 通过 `skill_version_tags` 聚合成 `Record<tag, version>`
- 文件清单通过 `skill_files where version_id = ?`

本地实现里，对应方法已经存在：

- `getSkillBySlug()`
- `listSkillVersions()`
- `getVersionDetail()`

### 对比版本

版本 diff 的关键不是数据库里存“diff 结果”，而是保存稳定快照。

对比流程应该是：

1. 选定两个版本
2. 读取两个版本的 `skill_files`
3. 以 `filename` 做 union
4. 根据 `sha256` 或文本内容判断：
   - added
   - removed
   - changed
   - same
5. 对选中文件读取左右文本内容做 Monaco diff

这种设计的好处：

- 数据库存的是事实快照
- diff 算法可以前端演进，不影响数据模型
- 无需为每一对版本预先落库存 diff

### 删除单个版本

删除单版本不能只删 `skill_versions` 一张表，必须保证一致性。

推荐步骤：

1. 校验 owner
2. 找到目标版本
3. 拒绝删除唯一版本
4. 删除该版本关联的 `skill_version_tags`
5. 删除该版本关联的 `skill_files`
6. 删除 `skill_versions` 主记录
7. 清理存储目录
8. 重新计算 `skills.latest_version`
9. 如有必要，修正 `skills.tags`

当前本地实现已经采用这个方向，见：

- `deleteSkillVersion()`

删除后必须回写 `latest_version`，否则 skill 会指向不存在的默认版本。

### 删除整个 skill

删除整个 skill 时，建议清理顺序为：

1. `stars`
2. `skill_embeddings`
3. `skill_version_tags`
4. 每个版本的 `skill_files`
5. `skill_versions`
6. `skill_aliases`
7. `skills`
8. 存储目录

虽然外键可以配置 cascade，但在本地版里显式清理更稳，因为历史库结构可能不完全一致。

### Rename slug

rename 的正确做法不是直接改字符串并结束，而是：

1. 校验 owner
2. 校验 `new_slug` 未被 `skills` 或 `skill_aliases` 占用
3. 更新 `skills.slug = new_slug`
4. 插入 `skill_aliases(source_slug = old_slug, target_skill_id = skill.id)`
5. 详情页和下载入口都支持 alias 解析

这样可以保证：

- 新地址立即生效
- 旧地址自动跳转
- 历史链接和 CLI 调用不中断

## API 设计建议

本地版多版本管理建议维持以下接口集合。

### 读取类

- `GET /api/v1/skills/:slug`
  - 返回当前 skill、latestVersion、tags、owner
- `GET /api/v1/skills/:slug/versions`
  - 返回版本列表
- `GET /api/v1/skills/:slug/versions/:version`
  - 返回某版本详情
- `GET /api/v1/skills/:slug/file?path=...`
  - 返回最新版本文件
- `GET /api/v1/skills/:slug/versions/:version/file?path=...`
  - 返回指定版本文件

### 写入类

- `POST /api/v1/skills`
  - 发布新版本
- `DELETE /api/v1/skills/:slug`
  - 删除整个 skill
- `DELETE /api/v1/skills/:slug/versions/:version`
  - 删除单个版本
- `PUT /api/v1/skills/:slug/versions/:version/tags`
  - 重设某个版本的 tags
- `PUT /api/v1/skills/:slug/rename`
  - 重命名 slug

## 关键一致性规则

数据库和服务层至少要保证以下规则：

### 规则 1：一个 skill 必须至少有一个版本

因此删除版本时：

- 如果该 skill 只剩一个版本，拒绝删除

### 规则 2：`latest_version` 必须存在于 `skill_versions`

如果：

- 发布新版本
- 删除当前最新版本
- rename skill

都必须确保 `skills.latest_version` 仍然指向有效版本号。

### 规则 3：tag 在 skill 维度唯一

`latest`、`stable`、`beta` 这些 tag 的唯一性必须按 skill 维度保证，而不是全局唯一。

即：

- `skill A` 的 `latest`
- `skill B` 的 `latest`

可以同时存在，但：

- `skill A` 不能同时有两个 `latest`

### 规则 4：旧 slug 不能再被新 skill 抢占

一旦 `old-slug` 被写进 `skill_aliases`，新的 skill 创建时应视为已占用。

否则会出现：

- 老链接无法判断应该跳转还是打开新 skill

### 规则 5：文件记录必须属于版本快照

不能做“修改某个已发布版本里的单个文件”这种半更新。

正确做法是：

- 任何内容变更都发布新版本

这样版本 diff、下载校验、哈希比较才有稳定语义。

## 为什么当前设计优于单表方案

如果把所有版本信息都塞进 `skills` 一张表，通常会遇到这些问题：

- 查询列表页和详情页时，历史版本 JSON 体积越来越大
- 很难对单个版本做删除和 tag 重绑
- 很难对单个文件做版本级 diff
- rename 后旧 slug 兼容会变成一堆分支逻辑

拆表之后的收益是：

- `skills` 负责当前态
- `skill_versions` 负责历史版本
- `skill_files` 负责文件快照
- `skill_version_tags` 负责版本标签
- `skill_aliases` 负责 slug 历史兼容

这正好对应了多版本管理的 5 个核心问题域。

## 当前实现与后续扩展

当前本地版已经基本落地了：

- 版本列表
- 历史版本文件浏览
- Monaco diff
- 单版本删除
- 版本 tag 绑定
- slug rename + old slug redirect

后续还可以继续增强：

- `skill_id + version` 增加显式唯一约束
- `skill_files(version_id, filename)` 增加唯一约束
- `skill_aliases` 增加 `redirect_kind`
- `skill_version_tags` 增加操作审计
- 引入 `skill_merges` 或 `canonical_skill_id`，支持 merge into canonical
- 引入发布事务和审计日志，保证批量写入时更强一致性

## 推荐实现顺序

如果从零开始做本地版 skill 多版本管理，推荐顺序是：

1. 先建 `skills`
2. 再建 `skill_versions`
3. 再建 `skill_files`
4. 补 `skill_version_tags`
5. 最后补 `skill_aliases`

对应功能顺序：

1. 发布新版本
2. 查看版本列表
3. 浏览历史文件
4. 做版本 diff
5. 删除单版本
6. 打 tag
7. rename slug

这个顺序的好处是：

- 每一步都能形成独立可验收能力
- 不会一开始就陷入 owner tools 全量重构

## 结论

skill 多版本管理的核心不是“版本号字段”，而是把 skill 作为稳定实体，把每次发布作为不可变快照来管理。

本地版最合适的数据库设计就是：

- `skills`：当前 skill 主体
- `skill_versions`：版本快照
- `skill_files`：版本文件集合
- `skill_version_tags`：tag 到版本的绑定
- `skill_aliases`：旧 slug 到 canonical skill 的映射

基于这套模型，版本列表、文件浏览、diff、tag、删除历史版本、rename/redirect 都能用一致的方式实现，而且后续继续扩展到 canonical merge 也不会推翻现有结构。
