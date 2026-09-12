---
name: sync-skills
description: 从 wiki 技能图鉴页面（https://wiki.biligame.com/nrc/技能图鉴）批量同步技能数据。先抓取图鉴页拿到全部技能名称与详情链接，再逐个访问详情页解析属性/类型/威力/耗能/描述，过滤掉状态/防御类技能，输出 JSON 到 .tmp 目录，并转换为 data/skills.js 的 SKILLS 数组。当用户要求更新/同步/抓取技能数据、生成技能 JSON 时使用。
---

# Sync Skills

从 `https://wiki.biligame.com/nrc/%E6%8A%80%E8%83%BD%E5%9B%BE%E9%89%B4`（技能图鉴）同步技能数据到 `data/skills.js`，并把解析结果输出为 `.tmp/skills.json`。

> 旧源 `rocom` 已下线，数据已迁移到 `nrc` 域，且详情页结构完全重写（见下方「数据来源与结构」）。本技能采用**两步法**：先抓图鉴页得到全部技能名称+详情链接，再逐个访问详情页取完整字段。

## 触发方式

- "从技能图鉴同步技能数据"
- "更新技能数据"
- "从 URL 拉取精灵技能数据并输出 json"
- "将技能 json 转为 data/skills.js"

## 数据来源与结构

### Step 1 · 技能图鉴页（`nrc` 域）

图鉴由 JS 服务端渲染，每个技能是一个 `div.nrc-skill-catalog-card` 卡片：

```html
<div class="nrc-skill-catalog-card"
     data-skill-catalog-category="物攻"      <!-- 类型：物攻/魔攻/防御/状态 -->
     data-skill-catalog-id="skill_000246"
     data-skill-catalog-recent="无"          <!-- 近期调整 有/无 -->
     data-skill-catalog-season="S1"
     data-skill-catalog-tags="回能"
     data-skill-catalog-type="普通"          <!-- 属性（系别） -->
     data-skill-catalog-text="抓挠 造成物伤，自己回复1能量。 普通系 物攻 S1 回能">
  <div class="nrc-skill-catalog-card-name">抓挠</div>
  <span class="nrc-skill-catalog-card-type-tag" title="普通系">…</span>
  <a href="/nrc/%E6%8A%93%E6%8C%A0">…</a>     <!-- 详情页链接 -->
</div>
```

- 图鉴页 `data-skill-catalog-total="579"`：物攻 199 / 魔攻 159 / 状态 167 / 防御 54
- 图鉴卡片**不直接给出威力/能耗**，因此必须走 Step 2 访问详情页
- 脚本用 `data-skill-catalog-category` 在图鉴层预过滤，只抓取攻击类（物攻/魔攻）详情页，避免对状态/防御技能发无用请求

### Step 2 · 技能详情页（`/nrc/<技能名>`）

例如 `https://wiki.biligame.com/nrc/%E6%8A%93%E6%8C%A0`，关键结构：

```html
<div class="nrc-skills nrc-skill-detail" data-skill-id="skill_000246" data-skill-type="普通">
  <div class="nrc-skill-header-name">抓挠</div>
  <div class="nrc-skill-identity-copy">抓挠 普通系 物攻</div>
  <span class="nrc-skill-category-chip">物攻</span>     <!-- 类型 -->
  <div class="nrc-skill-stats">
    <div class="nrc-skill-stat"><span class="nrc-skill-stat-value">35</span><span class="nrc-skill-stat-label">威力</span></div>
    <div class="nrc-skill-stat"><span class="nrc-skill-stat-value">0</span><span class="nrc-skill-stat-label">耗能</span></div>
  </div>
  <div class="nrc-skill-effect-text">造成物伤，自己回复1能量。</div>
  <div class="nrc-skill-icon"><img src="…/Skill_700005.png"/></div>
</div>
```

字段映射（输出到 JSON / `data/skills.js`）：

| 数据文件字段 | 来源 | 说明 |
|---|---|---|
| `n` 名称 | `.nrc-skill-name` | |
| `a` 属性 | 根节点 `data-skill-type` | 裸属性（普通/草/火…），无「系」字 |
| `k` 类型 | `.nrc-skill-category-chip`（首个非空） | 物攻/魔攻/防御/状态 |
| `p` 威力 | `.nrc-skill-stat` 中 label=威力 的值 | 数字；"—"/"无" → `null` |
| `c` 耗能 | `.nrc-skill-stat` 中 label=耗能 的值 | 数字；"—"/"无" → `null` |
| `cb` 连击 | 由 `desc` 正则提取「N连击」 | 固定连击数；无固定连击（含「连击数+1」等条件描述）为 `1`；`convert_skills.py` 转换时计算 |
| `desc` 描述 | `.nrc-skill-effect-text` | |
| `img` 图标 | `.nrc-skill-icon img` src | 不写入 `data/skills.js` |

> **注意**：wiki 偶发返回 HTTP `567`（限流），`fetch_skills.py` 已内置指数退避重试（2s/4s/8s，共 3 次）可自动恢复；详情页 HTML 会缓存到 `.tmp/skill_details/<名称>.html`，重跑可复用、便于排查。

## 完整工作流程

所有命令在**项目根目录**执行（即 `d:/workspace/github/RokePvP-Calculator`，脚本使用相对路径 `.tmp/`、`data/`）。本机为 Windows PowerShell，**不要**用 `cd /d`（`cd /d` 不是合法 PowerShell 参数）。

### Step 1: 下载技能图鉴页 HTML

```cmd
python -c "import requests,pathlib;url='https://wiki.biligame.com/nrc/%E6%8A%80%E8%83%BD%E5%9B%BE%E9%89%B4';r=requests.get(url,headers={'User-Agent':'Mozilla/5.0'},timeout=60);r.encoding='utf-8';pathlib.Path('.tmp').mkdir(exist_ok=True);pathlib.Path('.tmp/skill_gallery.html').write_text(r.text,encoding='utf-8');print(r.status_code,len(r.text))"
```

（也可跳过本步，直接运行 `fetch_skills.py`：若 `.tmp/skill_gallery.html` 不存在，它会自动下载图鉴页。）

### Step 2: 解析图鉴 + 抓取详情页 → JSON

```cmd
python ".codebuddy/skills/sync-skills/scripts/fetch_skills.py" .tmp/skill_gallery.html .tmp/skills.json
```

- 默认 `input=.tmp/skill_gallery.html`（`fetch_skills.py` 不存在该文件时会自动下载图鉴页）
- 默认 `output=.tmp/skills.json`
- **默认过滤** `k` 为 状态/防御 的技能，只保留物攻/魔攻/双攻
- 常用参数：
  - `--limit N`：只抓取前 N 个（测试，不覆盖正式数据）
  - `--all`：不过滤，保留全部技能（含状态/防御）
- 详情页并发抓取（线程数 `WORKERS=16`），带重试；结果打印类型分布摘要
- 实测：图鉴 579 张卡 → 攻击类 358 个 → 详情页全部解析成功，0 错误

### Step 3: 备份现有数据（覆盖前必须）

```cmd
Copy-Item data/skills.js data/skills.js.bak
```

### Step 4: 转换为 data/skills.js

```cmd
python ".codebuddy/skills/sync-skills/scripts/convert_skills.py" .tmp/skills.json data/skills.js
```

- 默认 `src=.tmp/skills.json`，`dst=data/skills.js`
- 生成格式（`img` 不写入数据文件）：

```js
const SKILLS = [
  { n: "抓挠", a: "普通", p: 35, k: "物攻", c: 0, cb: 1, desc: "造成物伤，自己回复1能量。" },
  ...
];
```

- `cb` 由 `desc` 提取（`(\d+)连击`，默认 1），供 `index.html` 在模式 B / FULL 选中技能时自动填充连击次数

### Step 5: 验证

用 node `vm` 校验语法与数据完整性（`const` 声明不挂载到 context，需用 `vm.runInContext(code + ";SKILLS;", sandbox)` 取回）：

```cmd
node -e "const vm=require('vm'),fs=require('fs');const sb={};vm.createContext(sb);const SKILLS=vm.runInContext(fs.readFileSync('data/skills.js','utf8')+'\n;SKILLS;',sb);console.log(SKILLS.length,SKILLS.every(s=>s.n&&s.a&&s.k&&typeof s.p==='number'&&typeof s.c==='number'&&typeof s.cb==='number'),SKILLS.reduce((m,s)=>(m[s.k]=(m[s.k]||0)+1,m),{}));"
```

- 检查：数量（攻击类约 358）、字段完整、名称无重复、关键技能存在（闪击/鸣沙陷阱/魔能爆等变动威力技能，其 `p` 为基准威力，运行时由 `index.html` 的分档表覆盖）
- 打开 `index.html` 手动验证：技能搜索下拉正常、FULL 配招可选到技能

## 注意事项

- **状态/防御技能默认被过滤**：`index.html` 的技能搜索与伤害计算按 `SKILLS` 工作，过滤后 FULL 配招模式无法选择状态/防御技能（状态技能在代码里 `skill.k==='状态'` 直接判为无伤害）。若用户要求保留全部技能，给 `fetch_skills.py` 加 `--all` 参数
- 所有用户可见文案为简体中文；文件 UTF-8 编码。终端乱码是显示端解码问题，不要"修复"编码（避免把中文塞进 `python -c` 内联脚本；必要的中文处理放脚本文件内，并用 `sys.stdout.reconfigure(encoding="utf-8")`，本脚本已处理）
- `data/skills.js` 被 `index.html` 在 body 末尾按序加载，不能移回 `<head>` 或加 `defer`
- 详情页 HTML 缓存于 `.tmp/skill_details/`，重跑复用；排查异常技能可直接读取对应缓存文件
- 修改 `fetch_skills.py` / `convert_skills.py` 后同步更新 `.tmp` 中的副本（若有）
