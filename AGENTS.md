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
- `data/*.js` — 游戏数据，均为全局常量，在 body 末尾、行内脚本之前**按序**加载：`spirits.js → skills.js → type.js → traitMult.js → skillMult.js → pinyin.js → spiritsPvP.js`
  - `spirits.js` → `const SPIRITS`：622 条。字段：`no`(3 位补零编号，同一编号可有多个形态) `n`(名称) `hp/pa/ma/pd/md/sp`(六项种族值) `a1/a2`(主/副属性) `tr`(特性名) `tr_desc`(特性描述) `st`(特殊形态/阶段文本，如「首领」，普通精灵为空串) `img`(wiki 图片 URL)。
  - `skills.js` → `const SKILLS`：358 条，当前只有 `k` 为 `物攻`(199) / `魔攻`(159) 两类（同步时已过滤状态/防御类技能）。字段：`n`(名称) `a`(属性) `p`(威力) `k`(类型) `c`(能耗) `cb`(连击数) `desc`(技能描述，随数据同步保留)。另有 `const SORTED_SPIRITS = SPIRITS` 别名（仅命名保留，并非已排序数组）。
  - `type.js` → `TYPE_CHART`(克制表 strong/weak/resist/vulnerable/immune)、`TYPE_COLORS`、`TYPE_TEXT_DARK`、`ALL_TYPES`。
  - `traitMult.js` → `ATK_TRAIT_RULES` / `DEF_TRAIT_RULES` 两张特性规则表，用 `defineAtkTraitRule(names, fieldsFn, effFn)` / `defineDefTraitRule(...)` 注册；**新增或修改特性伤害规则只改这里**，条件输入 UI 与计算在 index.html。文件末尾另有 **`TRAIT_CHANNELS` 静态通道声明表**（`mult` / `pwM` / `pwA` / `atkM` / `atkA`），决定 UI 显示哪些输入框 —— **新增或修改规则时必须同步登记**，否则 UI 会退化为只显示「特性倍率」。查询：`getTraitChannels(name)` / `traitChannelsToKinds(ch)`。显隐依据是「规则声明了哪些通道」而非「条件当前是否满足」。
  - `skillMult.js` → `SKILL_POWER_RULES` 技能威力规则表，用 `defineSkillPowerRule(names, fieldsFn, effFn)` 注册（当前 97 条，含 18 条按属性注册的愿力冲击）。**新增或修改技能威力修正规则只改这里**（连击修正规则已暂时移除：连击数一律取 `skills.js` 的 `cb`）。查询helper：`getSkillPowerRule` / `isSkillPowerUnimplemented` / `resolveSkillPower` / `getSkillPowerFields`。
  - `pinyin.js` → `const PINYIN_MAP`：汉字 → 全拼，供搜索用；由 `gen_pinyin.py` 生成，勿手改。
  - `spiritsPvP.js` → PvP 专用精灵数据（在 pinyin 之后加载）。
- `gen_pinyin.py` — 从 `data/spirits.js`、`data/skills.js` 的 `n` 字段收集汉字生成 `data/pinyin.js`（需 `pip install pypinyin`，运行前自动备份为 `pinyin.js.<时间戳>.bak`）。
- `.tmp/verify_formula.js` — 伤害公式的 Node 沙箱校验脚本,**改公式后必须重跑**：`node .tmp/verify_formula.js`（`.tmp` 已 gitignore，脚本可按需重建）。
- `analytics.js` — 百度统计，勿动。
- `.tmp/` — 数据同步的中间产物与缓存（已在 `.gitignore`）。

## 核心计算逻辑（均在 index.html 行内脚本中）

- 三种模式：`switchMode()` 切换 A（快捷）/ B（参数）/ FULL（配招），互斥显示：
  - **A**：威力按「游戏内显示值」处理 —— 已含特性/克制/能级/本系，因此 `calc()` 内**不乘**克制、本系、能级倍率，也不套能力等级、不吃特性攻防加成；属性选择器已隐藏（`buildTypeSelector('skill-type-selector-a')` 被注释掉）。
  - **B**：`applyQuickSkill()` 选中技能后由 `syncModeBAutoFields()` 自动填克制/本系/能级倍率；威力基数 = `base-power-b` + 技能威力固定修正 + 特性威力加算 `trait-power-b`。
  - **FULL**：`fullState` + `buildFullSkillRows()` / `openFskDropdown()` / `selectFskSkill()` / `calcOneFskDmg()` / `calcFull()` / `renderFullResult()`，攻防各 4 个技能槽；此模式下公共 `result-panel` 被隐藏。
- **伤害公式：四层拆分，唯一实现为 `computeDamage(o)`**（`calc()` 与 `calcOneFskDmg()` 都只调它，两处**不得**再出现连乘公式字面量）：
  ```
  attackValue  = (面板攻击 + Σ固定加成) × (1 + Σ特性百分比加成 + (攻击能力等级倍率 − 1))
  defenseValue = (面板防御 + Σ固定加成) × (1 + Σ特性百分比加成 + (防御能力等级倍率 − 1))
  powerSkill   = 技能威力（基础威力）
  powerBaseSeg = 技能威力 × 应对倍率(技能) × (1 + 本次威力+N%)      ← 基础威力段
  powerBonusAll= 技能威力加成 + 特性威力加成                       ← 加成段（不吃应对倍率）
  powerFinal   = (powerBaseSeg + powerBonusAll) × 特性威力倍率
  单次伤害= floor( attackValue / defenseValue × 37/41 × powerFinal × 克制 × 本系 × 特性乘算 × 额外倍率 × 减伤 )
  总伤害   = 单次伤害 × 连击数
  ```
  - **攻防层加成同区相加（用户定义，勿改回连乘）**：百分比加成与「能力等级倍率」在**同一个加成乘区**里相加 ——
    `246 ×（1 + 0.40 + 1.00）= 590.4`，而不是 `246 × 1.40 × 2.00 = 688.8`（等级 +10 → 等级倍率 2.0，其贡献是增量 +1.00）。
    固定点数仍在括号内先相加；**多个特性来源之间也相加**（`collectStatBuffs().pctMult = 1 + Σpct`，2 个 +20% = +40% 而非 ×1.44）。
  - **威力公式（用户定义，不可改）**：`威力 = (技能威力 × 应对倍率 × (1+本次威力%) + 技能威力加成 + 特性威力加成) × 特性威力倍率`。
    ⚠️ 两个要点：1) **应对倍率只放大基础威力，不放大「加上去的威力」**（技能/特性威力加成）；
    2) **特性威力倍率对基础段与加成段都生效**：`(100 × 3 + 55 + 10) × 1.5 = 547.5`
    （旧口径「加成裸加在最后」`(100×3×1.5) + 55 + 10 = 515` 已废弃）。
  - **通道归属**：`powerMult`（应对倍率）来自 `data/skillMult.js`；`powerTraitMult`（特性威力倍率）与 `powerTraitBonus`（特性威力加成）来自 `data/traitMult.js`；愿力冲击「应对状态→×2.5」同样走 `powerMult`。
  - **取整位置**：`Math.floor(单次) × 连击`，即先对单次取整再乘连击（与改造前一致，勿改）。
  - 模式 A 走同一条路径：传 `useLevel:false, typeEff:1, stab:1` 且不吃特性 buff。
  - `o` 入参关键字段：`atkBase/defBase`、`atkFlat/atkPctMult/atkLevelMult`、`defFlat/defPctMult/defLevelMult`、`powerBase`(技能威力)/`powerMult`(应对倍率)/`powerTraitMult`(特性威力倍率)/`powerPct`/`powerAdd`(技能加成)/`powerTraitBonus`(特性威力加成)`、`typeEff/stab/traitMult/extraMult/reduceMult/hits`。返回值含 `layers` 所需全部中间量（`attackValue/defenseValue/powerBase/powerFinal/singleDmg/dmg`）。
- **特性攻防加成（stat 通道）**：`collectStatBuffs(stat, isPhys)` 汇总 `stat:{patk,matk,pdef,mdef,spd:{pct,flat}}` → `{pctMult, flatSum, sources}`；`applyStatBuff()` 落值。口径：
  - **侧向生效**：物攻技能只吃 `patk`/`pdef`，魔攻技能只吃 `matk`/`mdef`（`双攻` 按取较高者那一侧）。速度 `spd` 不进伤害分式。
  - **叠加**：固定点数跨来源相加；百分比跨来源**也相加**（同特性内部按描述线性展开层数，不得写成幂）→ 合成出的 `pctMult = 1 + Σpct`，再与能力等级同区相加（见上文攻防层口径），全程不连乘。
  - **只算「攻方攻击力 + 防方防御力」**：不设 `target:'enemy'` 路由，防方特性不改攻方攻击力。只影响攻击力、或只给敌方加减攻击/防御的特性（`毒牙`、`虚假宝箱`）**不实现**。
  - `eff(ctx)` 另可返回 `powerMult`（特性威力倍率）、`powerBonus`（特性威力加成）、`powerPct`（威力百分比，实现上并入 `powerMult`）。
  - ⚠️ **30 条规则已从 `f` 迁移到专门通道**（`stat` 19 条 / `powerMult` 17 条 / `powerBonus` 2 条 / `powerPct` 1 条）。迁移后 `f` 一律为 1，`f` 只保留给「伤害总乘算 / 减伤」类（`偏振`/`完全偏振`/`绝对秩序`）。同时写 `f` 与 `stat`/`powerMult` 会双重叠加。
- **特性输入框（UI 层）** —— 每侧只显示该特性**声明**会用到的输入框，由 `TRAIT_CHANNELS`（`data/traitMult.js` 末尾静态表）决定：
  | 通道 | 输入框 | 所属层 |
  | --- | --- | --- |
  | `mult` | 特性倍率 | 结算层 |
  | `pwM` | 特性威力倍率 | 威力层（对基础段 + 加成段整体生效） |
  | `pwA` | 特性威力 | 威力层加成段（随后仍会被 `pwM` 放大） |
  | `atkM` | 特性攻击倍率（防方：特性防御倍率） | 攻击层 / 防御层 |
  | `atkA` | 特性攻击（防方：特性防御） | 攻击层 / 防御层 |
  - **显隐依据是「规则声明了哪些通道」，不是「条件当前是否满足」**：如 `蒸汽膨胀` 声明 `powerBonus`，即使层数 0 也只显示「特性威力」，不退化为「特性倍率」。未登记的特性 → 只显示「特性倍率」。
  - **手动覆盖 + 自动回填共存**：`updateTraitInputVisibility()` 用「输入源签名」（特性名 + 该侧全部条件输入）判断数据来源是否变化 —— 变化（换精灵/换技能/改条件）则清 `data-user-edited` 并回填规则值；不变（仅普通重算）则保留手填值。`onTraitInputEdit()` 打标记。
  - **重置 = 回到无加成基线**：`resetTraitInput()` 清该侧全部手动标记 → 条件输入框恢复规则声明默认值（次数 → 0，复选框 → 默认勾选）→ 重跑规则，倍率回到 `1.0`、加成回到 `0`。id 规则见 `traitInputId(kind, mode, side)`；`readTraitInputs()` 对隐藏项回退为规则计算值，不会重复叠加。
- **技能威力修正**：`data/skillMult.js`（79 条规则）。`resolveSkillPower(skill, ctx)` 返回 `{powerAdd, powerPct, powerMult, hitsSet, label, hasRule, unimplemented}`。条件字段渲染 `renderPowerCond()` / `onPowerCondChange()` / `readPowerOptsByMode()`，id 命名空间 `pwr-opt-{mode}-{slot}-{key}`（与 `trait-opt-*` 隔离）。`ctx.util` 由 `buildPowerUtil()` 注入（查表函数 + 面板值 + 敌方技能槽能耗/威力），**规则表内不碰 DOM**。
  - **未实现规则不提示**：`isSkillPowerUnimplemented()` 与 `resolveSkillPower()` 返回的 `unimplemented` 标记仍保留在 `data/skillMult.js`，但 UI 不再显示 `.power-mod-warn` 警告条（该样式已删除）—— 无规则的技能静默按基础威力计算，由用户自行手动填写威力/连击。
  - 变动威力查表：`SPEED_DIFF_TABLE`（闪击）、`PDEF_DIFF_TABLE`（鸣沙陷阱，与前者同一数组引用）、`MANA_BURST_TABLE`（魔能爆，本次新增接入自动回填）、`冰锋横扫`（敌方总能耗×10）、`怨力打击`/`钢钻`（公式型，`p:1` 为占位值）。`diffTableLookup()` 由 `util` 注入。FULL 模式经 `resolveAutoPowerForSlot()` 统一解析，**`buildFullSkillRows`/`calcOneFskDmg` 内不再有逐个 `if (sk.n === ...)` 硬编码**。
  - 愿力冲击为 18 条运行时注入（带 `desc`，`k:'双攻'` 取物攻/魔攻较高者）；「应对状态→威力×2.5」已在 `data/skillMult.js` 注册规则，条件框由 `renderPowerCond()` 在模式 B / FULL 技能槽渲染（走 `powerMult`，且应对倍率只作用于威力层的基础段），FULL 的 `?` 备注只剩说明文字。
- **结果栏四层拆解**：`renderLayersHtml(o)` 单一渲染函数，模式 B（`calc()`）与 FULL（`renderFullResult()`）**共用**，产出 4 个 `.breakdown-group`（攻击层橙 / 防御层蓝 / 威力层紫 / 结算层accent），子项 `　└ ` 前缀表示来源明细；`×` / `＋` 只出现在**数值列**，label 只写名称（缩进用 `　` / `　└`），避免「× 应对倍率 ×3.00」这种重复。星陨区块独立成块并标注「幻系追加 · 不吃特性与额外倍率」。
- 星陨印记：输入层数 `x` 后追加幻系伤害，威力 = `x² + 24x − 24`；**幻系技能不触发**（输入框自动禁用）；A/B/FULL 均支持。
- 特性倍率：`calcAtkTraitMult` / `calcDefTraitMult`（现返回 `powerBonus`/`powerPct`/`stat`）；条件输入用 `getTraitNeedsInput` / `getDefTraitNeedsInput` + `renderTraitCond()`，`onTraitCondChange()` / `readTraitOptsByMode()` 读写（后者改为**按 id 前缀全量扫描**，新增 key 无需改代码）。
- 属性克制：`getTypeEff`（含免疫判定）；本系加成判定 `hasStab`。
- 属性折算：`calcRealStat()`（含性格 `getNature()`、个体值）、`readIV()` / `setIv()`（个体值只有 **0 / 60** 两档）、`levelMult()`（能级倍率 = 1 + 0.1 × 等级，负级取倒数）。
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
- 「其他额外倍率 / 星陨印记层数 / 防御方减伤」三组输入框是 `.num-combo` 数值下拉（A/B/FULL 各一份，共 9 个）：预设值由 input 的 `data-num-opts` 声明，`initNumCombos()`（`DOMContentLoaded` 调用）构建选项；点选项后写值并派发 `input` 事件以复用各模式原有的 `oninput`（`calc` / `calcFull`），仍允许自由输入，失焦时空/非数字回填 `defaultValue`。**布局约束**：`.mult-box` 是 `flex:0 0 auto`，宽度由内容（label + input 固有宽度）撑开，故这些 input 在 `head.css` 中固定为 `width:0; min-width:100%` —— 否则 `type=text` 的固有宽度会把整行撑宽（110px → 229px）；同时不要给它们加左右 padding。
- `data/*.js` 不能移回 `<head>` 或加 `defer`：行内脚本在解析期立即执行并依赖这些全局常量，执行顺序颠倒会直接 ReferenceError 崩掉整个脚本。
- 模式 A 不计算克制/本系/能级（威力已包含），不要"顺手补齐"；模式 B 的倍率框可手动覆盖自动值，`syncModeBAutoFields()` 只在切精灵/切属性时重填。
- `st` 是特殊形态/阶段文本（如「首领」）而非进化阶段；`SORTED_SPIRITS` 只是 `SPIRITS` 的别名，不要假设它已排序。
- FULL 模式下 `calcFull()` 在攻防双方未选齐时提前返回，两侧技能面板标题保持「未选择精灵」——这是现有约定，不是 bug。
- 技能库当前没有 `k === '状态'` 的数据，但下拉渲染与 FULL 计算仍保留该分支（单独分组、"不造成直接伤害"提示），删数据分支前请先确认同步侧不会再加回。
- `index.html` 体量大，编辑时用精确锚点定位替换，避免整文件重写。
- 公式**只有** `computeDamage()` 一个实现点。看到别处出现 `* (37/41) *` 之类的字面量即为分叉，必须收敛回 `computeDamage()`。
- 新增特性攻防规则时：若特性语义是「改攻防属性」而非「改伤害倍率」，用 `stat` 通道并把 `f` 置 1，**不要**两者都写。
- 新增技能威力规则时：在 `data/skillMult.js` 用 `defineSkillPowerRule` 注册；「变为 N 倍」用 `powerMult`（乘除段），「+N / +N%」用 `powerAdd` / `powerPct`（`powerAdd` 进加减段）。字段构造器用 `spCk` / `spNum`（**不要**用 `ck` / `num`，那是 `traitMult.js` 的全局名，重复声明会崩）。
- `data/skillMult.js` 与 `data/traitMult.js` 都**不得**引用 `SPEED_DIFF_TABLE` / `MANA_BURST_TABLE` / `diffTableLookup` 等 index.html 内的绑定（加载期它们还不存在）；一律通过 `ctx.util` 注入。
- 特性输入框的自动回填靠「输入源签名」（特性名 + 条件输入）判断：条件一变就清手动标记并回填规则值。若在 `calc()` 的重算路径里无条件回填，会把用户手填值冲掉。
- 特性规则未覆盖但 `tr_desc` 含攻防关键词时，需给用户「规则待补全」提示，不要静默按无加成处理（与技能侧 `isSkillPowerUnimplemented` 同理）。
