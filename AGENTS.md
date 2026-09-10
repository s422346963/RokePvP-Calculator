# AGENTS.md

## 项目概述

洛克王国 PVP 伤害计算器 —— 纯前端静态网页工具，**无构建系统、无 package.json、无依赖、无测试/lint**。

- 数据来源：[BWiki 精灵图鉴](https://wiki.biligame.com/nrc/%E7%B2%BE%E7%81%B5%E5%9B%BE%E9%89%B4) / [技能图鉴](https://wiki.biligame.com/nrc/%E6%8A%80%E8%83%BD%E5%9B%BE%E9%89%B4)（`nrc` 域；旧 `rocom` 域已下线）
- 现有数据规模：精灵 622 条（含不同形态/首领）、技能 358 条 + 运行时注入的 18 条「愿力冲击」

## 运行与验证

- 直接用浏览器打开 `index.html` 即可。数据以 `<script src>` 全局常量形式加载，不发网络请求（精灵缩略图走 BWiki 外链，失败时降级为属性 emoji）
- 如需本地服务器：`python -m http.server 8080`
- 验证改动：打开页面 → 选攻击/防御精灵 → 调参数 → 核对结果数字、拆解项与 UI；FULL 模式需先选齐双方并配置技能，再点技能行查看明细

## 结构与架构边界

- `index.html` — 巨型单文件（约 175KB / 约 3280 行）：全部 UI 标记 + 全部计算逻辑都在行内 `<script>`（位于 body 末尾、数据脚本之后），入口为文件底部 `DOMContentLoaded`。
- `css/head.css` — 唯一样式表（主题变量、卡片、布局）。
- `data/*.js` — 游戏数据，均为全局常量，在 body 末尾、行内脚本之前**按序**加载：`spirits.js → skills.js → type.js → traitMult.js → pinyin.js`
  - `spirits.js` → `const SPIRITS`：622 条。字段：`no`(3 位补零编号，同一编号可有多个形态) `n`(名称) `hp/pa/ma/pd/md/sp`(六项种族值) `a1/a2`(主/副属性) `tr`(特性名) `tr_desc`(特性描述) `st`(特殊形态/阶段文本，如「首领」，普通精灵为空串) `img`(wiki 图片 URL)。
  - `skills.js` → `const SKILLS`：358 条，当前只有 `k` 为 `物攻`(199) / `魔攻`(159) 两类（同步时已过滤状态/防御类技能）。字段：`n`(名称) `a`(属性) `p`(威力) `k`(类型) `c`(能耗) `desc`(技能描述，随数据同步保留)。另有 `const SORTED_SPIRITS = SPIRITS` 别名（仅命名保留，并非已排序数组）。
  - `type.js` → `TYPE_CHART`(克制表 strong/weak/resist/vulnerable/immune)、`TYPE_COLORS`、`TYPE_TEXT_DARK`、`ALL_TYPES`。
  - `traitMult.js` → `ATK_TRAIT_RULES` / `DEF_TRAIT_RULES` 两张特性规则表，用 `defineAtkTraitRule(names, fieldsFn, effFn)` / `defineDefTraitRule(...)` 注册；**新增或修改特性伤害规则只改这里**，条件输入 UI 与计算在 index.html。
  - `pinyin.js` → `const PINYIN_MAP`：汉字 → 全拼，供搜索用；由 `gen_pinyin.py` 生成，勿手改。
- `gen_pinyin.py` — 从 `data/spirits.js`、`data/skills.js` 的 `n` 字段收集汉字生成 `data/pinyin.js`（需 `pip install pypinyin`，运行前自动备份为 `pinyin.js.<时间戳>.bak`）。
- `design.md` — 视觉与交互设计规范。**改 UI 前先读它**。
- `analytics.js` — 百度统计，勿动。
- `.tmp/` — 数据同步的中间产物与缓存（已在 `.gitignore`）。

## 核心计算逻辑（均在 index.html 行内脚本中）

- 三种模式：`switchMode()` 切换 A（快捷）/ B（参数）/ FULL（配招），互斥显示：
  - **A**：威力按「游戏内显示值」处理 —— 已含特性/克制/能级/本系，因此 `calc()` 内**不乘**克制、本系、能级倍率，也不套能力等级；属性选择器已隐藏（`buildTypeSelector('skill-type-selector-a')` 被注释掉）。
  - **B**：`applyQuickSkill()` 选中技能后由 `syncModeBAutoFields()` 自动填克制/本系/能级倍率；威力 = 基础威力 + 「特性威力」`trait-power-b`（威力加法型特性，如蒸汽膨胀，可手动改）。
  - **FULL**：`fullState` + `buildFullSkillRows()` / `openFskDropdown()` / `selectFskSkill()` / `calcOneFskDmg()` / `calcFull()` / `renderFullResult()`，攻防各 4 个技能槽；此模式下公共 `result-panel` 被隐藏。
- 伤害公式（`calc()` 与 `calcOneFskDmg()` 一致）：
  `floor((攻方攻击 ÷ 防方防御) × 37/41 × 威力 × 克制 × 本系 × 攻方特性 × 防方特性 × 额外倍率 × 减伤 × 连击)`
- 星陨印记：输入层数 `x` 后追加幻系伤害，威力 = `x² + 24x − 24`；**幻系技能不触发**（输入框自动禁用）；A/B/FULL 均支持。
- 特性倍率：`calcAtkTraitMult` / `calcDefTraitMult`；需要条件的特性用 `getTraitNeedsInput` / `getDefTraitNeedsInput` + `renderTraitCond()` 动态生成输入框，`onTraitCondChange()` / `readTraitOptsByMode()` 读写取值。
- 属性克制：`getTypeEff`（含免疫判定）；本系加成判定 `hasStab`。
- 变动威力技能：闪击（速度差）、鸣沙陷阱（物防差）查 `SPEED_DIFF_TABLE`（鸣沙复用同一张表，别名 `PDEF_DIFF_TABLE`）→ `diffTableLookup()`；魔能爆查 `MANA_BURST_TABLE`；愿力冲击为 18 条运行时注入（每属性一条，`k:'双攻'` 取物攻/魔攻较高者），FULL 模式勾选「对手本回合使用状态技能」后威力 ×2.5（`setYuanliBoost`）。分档数据已按游戏内权威表核对（2026-08）。
- 属性折算：`calcRealStat()`（含性格 `getNature()`、个体值）、`readIV()` / `toggleIV()`（个体值只有 **0 / 60** 两档，点按钮切换）、`levelMult()`（能级倍率 = 1 + 0.1 × 等级，负级取倒数）。
- 搜索：`matchQuery()` 支持中文子串 / 全拼 `toPinyin()` / 首字母 `toInitials()`；精灵下拉 `setupSearch()` 无输入时按 `a1` 属性分组（默认折叠、显示数量），有输入时扁平过滤取前 40 条。
- 持久化：收藏夹用 `localStorage`（键 `roko_favorites` / `roko_fav_panel_open` / `roko_fav_panel_pos`，`loadFavorites`/`saveFavorites`，浮层可拖动 `setupFavPanelDrag`/`applyFavPanelPos`）；主题 `toggleTheme()` 切 `data-theme="light"`，**默认日间且不持久化**。

## 更新游戏数据（常见任务）

- **不要凭记忆手写精灵/技能数值** —— 使用 `.codebuddy/skills/` 下的 AI 技能（注意目录名与技能 `name` 不完全一致）：
  - `sync-spirits`（目录 `.codebuddy/skills/sync-spirits/`）：按编号范围批量从 wiki 同步。`scripts/sync_spirits.py` 编排（内部调用 `extract_spirits.py` 解析图鉴页、`fetch_spirit_detail.py` 解析详情页），加 `--merge` 才写入 `data/spirits.js`（写前备份到 `.tmp/spirits.js.bak`），不加则只产出 `.tmp/spirits_full.json`。依赖 `requests` + `beautifulsoup4`；详情页缓存在 `.tmp/spirit_details/`。
  - `sync-skills`（目录 `sync-skills/`）：从技能图鉴同步，`scripts/fetch_skills.py` 抓取（`requests` + `bs4`）→ `scripts/convert_skills.py` 转成 `data/skills.js`；会过滤掉状态/防御类技能，中间 JSON 输出到 `.tmp/`。
  - `add-spirit`（name: `add-spirit-skill`）：手动新增单只精灵。
  - `update-spirit`（name: `update-spirit-stats`）：修改已有精灵的资质等字段。
- 同步脚本在**项目根目录**执行（脚本内部用相对路径 `.tmp/`、`data/`），PowerShell 下不要用 `cd /d`。
- 同步失败多为 wiki 的 WAF `567` 间歇拦截：单只失败不中断整轮，失败精灵不写库，直接重跑同一命令即可收敛（实测全量 622 只 2–4 轮成功）。
- 向 `SPIRITS` 追加时：插在最后一个 `}` 之后、`]` 之前；用 `no`+`n` 组合去重；4 空格缩进。
- 新增/改名后运行 `python gen_pinyin.py` 重建拼音映射，否则新名字搜不到。

## 约定与已知坑

- 所有用户可见文案为**简体中文**；文件编码 UTF-8（部分 CRLF 行尾）。终端输出中文出现乱码通常是显示端解码问题，文件本身有效，**不要"修复"编码**。
- UI 遵循"攻橙防蓝"语义：攻击方暖色、防御方冷色，始终成对出现（详见 design.md）；**默认日间主题且刷新后不保留**切换结果。
- `data/*.js` 不能移回 `<head>` 或加 `defer`：行内脚本在解析期立即执行并依赖这些全局常量，执行顺序颠倒会直接 ReferenceError 崩掉整个脚本。
- 模式 A 不计算克制/本系/能级（威力已包含），不要"顺手补齐"；模式 B 的倍率框可手动覆盖自动值，`syncModeBAutoFields()` 只在切精灵/切属性时重填。
- `st` 是特殊形态/阶段文本（如「首领」）而非进化阶段；`SORTED_SPIRITS` 只是 `SPIRITS` 的别名，不要假设它已排序。
- FULL 模式下 `calcFull()` 在攻防双方未选齐时提前返回，两侧技能面板标题保持「未选择精灵」——这是现有约定，不是 bug。
- 技能库当前没有 `k === '状态'` 的数据，但下拉渲染与 FULL 计算仍保留该分支（单独分组、"不造成直接伤害"提示），删数据分支前请先确认同步侧不会再加回。
- `index.html` 体量大，编辑时用精确锚点定位替换，避免整文件重写。
