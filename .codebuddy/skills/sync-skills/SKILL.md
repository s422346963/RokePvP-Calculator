---
name: sync-skills
description: 从 wiki 技能图鉴页面（https://wiki.biligame.com/rocom/技能图鉴）批量同步技能数据。抓取技能图鉴页、过滤掉状态/防御类技能、输出 JSON 到 .tmp 目录，并转换为 data/skills.js 的 SKILLS 数组。当用户要求更新/同步/抓取技能数据、生成技能 JSON 时使用。
---

# Sync Skills

从 `https://wiki.biligame.com/rocom/%E6%8A%80%E8%83%BD%E5%9B%BE%E9%89%B4`（技能图鉴）同步技能数据到 `data/skills.js`，并将解析后的数据输出为 `.tmp/skills.json`。

## 触发方式

- "从技能图鉴同步技能数据"
- "更新技能数据"
- "从 URL 拉取精灵技能数据并输出 json"
- "将技能 json 转为 data/skills.js"

## 数据来源与卡片结构

技能图鉴页面由 Lua 模块 `DexIndex` 动态渲染，最终 HTML 中每个技能是一个 `.dex-skill-card` 卡片：

```html
<div class="divsort dex-card dex-skill-card" data-param6="S1" data-param7="回能" data-param8="无" data-dex-search="...">
  <div class="dex-skill-card-face">
    <div class="dex-skill-art">...<div class="dex-skill-icon"><a href="..."><img src="..."/></a></div></div>
    <div class="dex-skill-body">
      <div class="dex-card-name"><a href="/rocom/...">抓挠</a></div>
      <div class="dex-skill-tags"><span class="dex-type dex-type-普通"><img/><span>普通</span></span><span class="dex-skill-kind">物攻</span></div>
      <div class="dex-skill-desc">造成物伤，自己回复1能量。</div>
    </div>
    <div class="dex-skill-meta"><span><strong>35</strong><em>威力</em></span><span><strong>0</strong><em>耗能</em></span></div>
  </div>
</div>
```

- `data-param1`：类型（物攻/魔攻/防御/状态）；`data-param2`：属性；`data-param6`：版本（S1/S2/S3）；`data-param7`：技能标签；`data-param8`：近期调整（有/无）
- `.dex-skill-meta` 中两个 `<strong>` 分别为威力、能耗；防御/状态类技能威力显示 "—"，应转为 `null`
- 页面筛选器统计可作为校验依据：物攻 190 / 魔攻 155 / 防御 52 / 状态 156，S1 469 / S2 27 / S3 57，有调整 5

## 完整工作流程

### Step 1: 下载技能图鉴页面 HTML

使用 `execute_command`（Python + requests，避免 curl 编码问题）下载页面到 `.tmp/skill_gallery.html`：

```cmd
cd /d "d:/workspace/github/RokePvP-Calculator"
python -c "import requests, pathlib; url='https://wiki.biligame.com/rocom/%E6%8A%80%E8%83%BD%E5%9B%BE%E9%89%B4'; r=requests.get(url, headers={'User-Agent':'Mozilla/5.0'}, timeout=60); r.encoding='utf-8'; pathlib.Path('.tmp').mkdir(exist_ok=True); pathlib.Path('.tmp/skill_gallery.html').write_text(r.text, encoding='utf-8'); print(r.status_code, len(r.text))"
```

**注意**：不要在命令行内联中文（Windows 控制台 GBK 乱码会破坏脚本）。中文处理一律放脚本文件内，用 `sys.stdout.reconfigure(encoding="utf-8")` 输出。

### Step 2: 解析技能数据

运行 `scripts/fetch_skills.py` 解析 HTML 并输出 JSON：

```bash
python "<skill_base>/scripts/fetch_skills.py" [input_html] [output_json]
```

- 默认 `input_html=.tmp/skill_gallery.html`，`output_json=.tmp/skills.json`
- **默认过滤**掉 `k` 为 "状态" 或 "防御" 的技能，只保留物攻/魔攻（攻击类）
- 输出字段：`n`（名称）、`a`（属性）、`k`（类型）、`p`（威力，数字或 null）、`c`（能耗）、`desc`（描述）、`img`（图标）
- 脚本会打印类型分布摘要，与页面筛选器统计核对

### Step 3: 备份现有数据（覆盖前必须）

覆盖 `data/skills.js` 前先备份：

```cmd
Copy-Item data/skills.js data/skills.js.bak
```

### Step 4: 转换为 data/skills.js

运行 `scripts/convert_skills.py` 将 JSON 转为 SKILLS 数组：

```bash
python "<skill_base>/scripts/convert_skills.py" [src_json] [dst_js]
```

- 默认 `src=.tmp/skills.json`，`dst=data/skills.js`
- 生成格式（字段映射，`img` 不写入数据文件）：

```js
const SKILLS = [
  { n: "抓挠", a: "普通", p: 35, k: "物攻", c: 0, desc: "造成物伤，自己回复1能量。" },
  ...
];
```

### Step 5: 验证

用 node `vm` 校验语法与数据完整性（`const` 声明不挂载到 context 对象，需用 `vm.runInContext(code + ";SKILLS;", sandbox)` 取回）：

```js
const vm = require("vm"), fs = require("fs");
const sandbox = {};
vm.createContext(sandbox);
const SKILLS = vm.runInContext(fs.readFileSync("data/skills.js", "utf8") + "\n;SKILLS;", sandbox);
console.log(SKILLS.length, SKILLS.every(s => s.n && s.a && s.k && typeof s.p === "number" && typeof s.c === "number"));
```

- 检查：数量、字段完整、名称无重复、关键技能存在（闪击/鸣沙陷阱/魔能爆等变动威力技能）
- 打开 `index.html` 手动验证：技能搜索下拉正常、FULL 配招可选到技能

## 注意事项

- **状态/防御技能会被过滤**：`index.html` 的技能搜索用 `SKILLS.map(...)` 生成列表，过滤后 FULL 配招模式无法选择状态/防御技能。若用户要求保留全部技能，需修改 `fetch_skills.py` 的过滤逻辑（`if kind in ("状态", "防御"): continue`）
- 所有用户可见文案为简体中文；文件 UTF-8 编码。终端乱码是显示端解码问题，不要"修复"编码
- `data/skills.js` 被 `index.html` 在 body 末尾按序加载，不能移回 `<head>` 或加 `defer`
- 修改 `fetch_skills.py` / `convert_skills.py` 后同步更新 `.tmp` 中的副本（若有）
