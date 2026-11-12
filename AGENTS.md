# AGENTS.md

## 项目概述

洛克王国 PVP 伤害计算器 —— 纯前端静态网页工具，**无构建系统、无 package.json、无依赖、无 lint**（开发期校验脚本见 `.tmp/`，已 gitignore）。

- 数据来源：[BWiki 精灵图鉴](https://wiki.biligame.com/nrc/%E7%B2%BE%E7%81%B5%E5%9B%BE%E9%89%B4) / [技能图鉴](https://wiki.biligame.com/nrc/%E6%8A%80%E8%83%BD%E5%9B%BE%E9%89%B4)（`nrc` 域；旧 `rocom` 域已下线）
- 现有数据规模：精灵 651 条（含不同形态/首领）、技能 372 条 + 运行时注入的 18 条「愿力冲击」、特性规则覆盖 104 条（攻 76 / 防 28，另 1 条等级类 `TRAIT_LEVEL_RULES`）、技能威力规则 101 条（均按名称计）

## 运行与验证

- 直接用浏览器打开 `index.html` 即可。数据以 `<script src>` 全局常量形式加载，不发网络请求（精灵缩略图走 BWiki 外链，失败时降级为属性 emoji）
- 如需本地服务器：`python -m http.server 8080`
- 验证改动：打开页面 → 选攻击/防御精灵 → 调参数 → 核对结果数字、拆解项与 UI；FULL 模式需先选齐双方并配置技能，再点技能行查看明细
- 回归基线（`.tmp/` 内，已 gitignore）：`node .tmp/verify_formula.js`（公式断言 + 拆分护栏）、`node .tmp/smoke_load.js`（加载期冒烟，带 DOM 桩按浏览器顺序加载全部来源）
- 专项校验（同 `.tmp/`）：`node .tmp/check_weather.js`（天气/印记是否只并入技能威力乘区）、`node .tmp/verify_spirits_data.js`（精灵条数 / 字段完整性 / `no`+`n` 去重）

## 结构与架构边界

- `index.html` — **约 546 行纯 HTML**（head / header / 精灵卡 / 模式面板 / 天气与进攻方印记控件 / 收藏浮层 / 弹窗 / 吸底结果条）+ body 末尾的 `<script src>` 标签；**已无行内 `<script>`**（2026-10 拆分，原约 4784 行单文件 → `js/01`~`08`，原位置留「已搬迁至」指针注释）。
- `css/head.css` — 唯一样式表（主题变量、卡片、布局）。
- `js/01-core.js` ~ `js/08-fav-init.js` — 经典脚本（**禁 `type="module"`、禁 `defer`**，原因同 `data/*.js`：`file://` 下 module 被 CORS 拦掉白屏；解析期依赖全局常量），共享同一全局作用域，**加载顺序即依赖顺序**，在 body 末尾、`data/*.js` 之后按序加载：

  | 文件 | 职责 | 关键内容 |
  | --- | --- | --- |
  | `js/01-core.js` | 纯逻辑 1 | `toPinyin`/`toInitials`/`matchQuery`、愿力冲击运行时注入（顶层 `SKILLS.push`，唯一允许的数据注入类顶层语句）、`state`（含 `weather`/`marks`）、`getWeather`/`weatherCondDefault`、`MARK_TABLE`/`getActiveMarks`/`getMarkInfo`、`calcRealStat`/`readIV`/`setIv`/`toggleIV`、性格表、`f1`/`f2`/`f3`、`diffTableLookup`/`levelMult`/`getTypeEff`/`hasStab`、`SPEED_DIFF_TABLE`/`PDEF_DIFF_TABLE`/`MANA_BURST_TABLE`、搜索索引 `filterSpiritsByQuery`/`filterSkillsByQuery`/`searchScore`/`pinyinSegmentMatch` |
  | `js/02-damage.js` | 公式层 | **`computeDamage`（唯一实现点）**、`collectStatBuffs`、`applyStatBuff`、`buildPowerUtil`、`mergeBuffSourcesList`、`renderLayersHtml`（纯字符串）。**禁止出现 DOM 引用**（`verify_formula.js` 有断言） |
  | `js/03-trait.js` | 特性层 | `calcAtkTraitMult`/`calcDefTraitMult`/`checkDefCarriesAttr`/`getTraitNeedsInput` 等计算 + 特性面板 UI（`updateTraitInputVisibility`/`renderTraitCond`/`renderTraitNote`/`readTraitInputs`/`traitInputId`/条件签名缓存）；条件默认值经 `weatherCondDefault()` 支持天气联动 |
  | `js/04-power.js` | 威力桥接层 | `renderPowerCond`/`readPowerOptsByMode`/`buildPowerCtx`/`buildFullPowerCtx`/`resolveAutoPowerForSlot`/`getFskPowerTipHTML`/`updatePowerTip`/`traitPowerFor`；全局参数 UI：`syncWeatherSelects`/`applyWeatherToConds`/`onWeatherChange`、`syncMarkUI`/`onMarkChange`/`onMarkStacksChange` |
  | `js/05-card.js` | 卡片交互层 | `renderCard`/`setupSearch`/`recalcStats`/能力等级/IV/交换/num-combo/`traitPanelHTML`+`renderTraitPanels`（特性面板模板：`.trait-head-row` / 每组重置按钮 / 规则提示位 `#trait-{side}-note-{mode}`）、`SORTED_SPIRITS` 别名 |
  | `js/06-calc-ab.js` | 模式 A/B | `switchMode`/`calc`/技能下拉 picker/`buildTypeSelector`（B 模式活调用）/吸底结果条 `updateResultDock`·`clearResultDock`·`syncResultDockVisibility` |
  | `js/07-full.js` | FULL 模式 | `fullState`/`buildFullSkillRows`/`openFskDropdown`/`selectFskSkill`/`calcOneFskDmg`/`calcFull`/`renderFullResult` |
  | `js/08-fav-init.js` | 收尾层 | 收藏/`loadFavorites`·`saveFavorites`/拖动浮层/`toggleTheme`/通用弹窗/**全部事件绑定**/顶层 INIT（含 `syncWeatherSelects`/`syncMarkUI` 对齐）/`initResultDock`/`DOMContentLoaded` 入口 |

  ⚠️ **顶层可执行语句只允许出现在 `js/08-fav-init.js`**（唯一例外：`js/01-core.js` 的愿力冲击数据注入，必须晚于 `data/skills.js`）。跨文件函数调用只在调用期解析，合法；但**跨文件重名顶层 `const/let` 会 SyntaxError 整页白屏**（`function` 重名则是后者静默覆盖，曾是 `readTraitOpts` 真隐患），`verify_formula.js` 有重名断言。
- `data/*.js` — 游戏数据，均为全局常量，在 body 末尾、`js/*.js` 之前**按序**加载：`spirits.js → skills.js → type.js → traitMult.js → skillMult.js → pinyin.js → spiritsPvP.js`
  - `spirits.js` → `const SPIRITS`：651 条。字段：`no`(3 位补零编号，同一编号可有多个形态) `n`(名称) `hp/pa/ma/pd/md/sp`(六项种族值) `a1/a2`(主/副属性) `tr`(特性名) `tr_desc`(特性描述) `st`(特殊形态/阶段文本，如「首领」，普通精灵为空串) `img`(wiki 图片 URL)。
  - `skills.js` → `const SKILLS`：372 条，当前只有 `k` 为 `物攻`(208) / `魔攻`(164) 两类（同步时已过滤状态/防御类技能）。字段：`n`(名称) `a`(属性) `p`(威力) `k`(类型) `c`(能耗) `cb`(连击数) `desc`(技能描述，随数据同步保留)。
  - `type.js` → `TYPE_CHART`(克制表 strong/weak/resist/vulnerable/immune)、`TYPE_COLORS`、`TYPE_TEXT_DARK`、`ALL_TYPES`。
  - `traitMult.js` → `ATK_TRAIT_RULES` / `DEF_TRAIT_RULES` 两张特性规则表（注册 76 / 28 个特性名），用 `defineAtkTraitRule(names, fieldsFn, effFn)` / `defineDefTraitRule(...)` 注册（自身增益类走双侧 `defineBothTraitRule`，如「渗透」）；**新增或修改特性伤害规则只改这里**，条件输入 UI 与计算在 `js/03-trait.js`。文件末尾另有 **`TRAIT_CHANNELS` 静态通道声明表**（`mult` / `pwM` / `pwA` / `atkM` / `atkA`，共 90 条，支持按侧声明 / 并列），决定 UI 显示哪些输入框 —— **新增或修改规则时必须同步登记**，否则 UI 会退化为只显示「特性倍率」。值可为普通通道对象，或 `{ sides: { atk: <ch>, def: <ch> } }` **按侧声明**（同一特性攻/防侧落在不同层时用，如「圣龙的守护」攻方 `atkM` / 防方 `mult`）；`mult` 可与其它通道**并列**显示。查询：`getTraitChannels(name)`（原始登记值）/ `getTraitChannelsForSide(name, side)`（解析 sides + 防方自动推导）/ `traitChannelsToKinds(ch)`。显隐依据是「规则声明了哪些通道」而非「条件当前是否满足」。条件字段构造器为 `ck`（复选框）/ `num`；`key === 'blizzard'`（天气为暴风雪）的勾选框默认值由天气联动，见下文天气系统；`key === 'level'`（等级类特性的当前等级）默认值取自 `state.{atk,def}TraitLevel`，B / FULL 共用一份。
  - **精灵名 → 计算特性名别名**：文件末尾的 `SPIRIT_TRAIT_ALIAS`（精灵名 → 查表特性名）+ `resolveTraitName(spirit)`。规则表 / 通道表 / 等级规则全部按**特性名**索引，而同一个 `tr` 可能被多只精灵共用（如 8 只棋契陛下的「御驾亲征」），因此「只让其中某只走别的特性规则」不能靠加特性名实现，也不能直接改 `spirits.js` 的 `tr`（会被数据同步覆盖，且卡片会显示错误特性名）。做法：在 `SPIRIT_TRAIT_ALIAS` 登记一条别名。⚠️ 凡是用 `spirit.tr` 去查 `ATK_TRAIT_RULES` / `DEF_TRAIT_RULES` / `TRAIT_CHANNELS` / `TRAIT_LEVEL_RULES` 的地方（`js/03` 的 calc / 显隐 / 重置 / 等级、`js/04` 的 `traitPowerFor`、`js/06`·`js/07` 的 `readTraitInputs`、冰钻判定）必须改用 `resolveTraitName(spirit)`；**展示文案仍用 `spirit.tr`**。当前 2 条：棋契陛下（白/黑棋棋绮后分支）→ `渗透`。校验：`node .tmp/check_trait_alias_runtime.js`。
  - **等级类特性**：`TRAIT_LEVEL_RULES`（特性名 → `{ label, def, min, max, step }`，用 `defineTraitLevelRule(names, opts)` 登记，当前「恶龙的奢望」= 等级 `99` / `9–99` / 步进 `10`）。持有这类特性时生效等级**直接取条件框里手填的等级**（默认值来自上表），否则用隐藏基础等级 60；由 `js/03` 的 `getEffectiveLevel(side)` 统一给出，`recalcStats()` 用它折算面板值，规则内部**直接用 `ctx.level`**，不要自己再算。条件变化走 `syncTraitLevelState()` → 写回 `state.{atk,def}TraitLevel` → 重算面板。
  - `skillMult.js` → `SKILL_POWER_RULES` 技能威力规则表，用 `defineSkillPowerRule(names, fieldsFn, effFn)` 注册（当前 101 条，含 18 条按属性注册的愿力冲击）。**新增或修改技能威力修正规则只改这里**（连击修正规则已暂时移除：连击数一律取 `skills.js` 的 `cb`）。查询helper：`getSkillPowerRule` / `isSkillPowerUnimplemented` / `resolveSkillPower` / `getSkillPowerFields`。⚠️ `resolveSkillPower()` 是**全局威力修正的唯一汇聚点**：天气（雨天→水系 +75%）与进攻方印记在此与技能规则 `powerPct` **同区相加**，无规则时也照常生效。
  - `pinyin.js` → `const PINYIN_MAP`（汉字 → 全拼）+ `const PINYIN_WORDS`（多音字词组 → 逐字拼音数组），供搜索用；由 `gen_pinyin.py` 生成，勿手改。
  - `spiritsPvP.js` → PvP 专用精灵数据（在 pinyin 之后加载）。
- `gen_pinyin.py` — 从 `data/spirits.js`、`data/skills.js` 的 `n` 字段收集汉字生成 `data/pinyin.js`（需 `pip install pypinyin`，运行前自动备份为 `pinyin.js.<时间戳>.bak`）。多音字修正只改文件顶部的两个表：`CHAR_PINYIN_OVERRIDES`（单字默认读音，如「长」→`chang`）与 `WORD_PINYIN_OVERRIDES`（词组读音，如「船长」→`chuan zhang`、`重启`、`重构`、`恐吓`、`宝藏`），生成后由 `js/01-core.js` 的 `toPinyinSyllables()` 按最长词组优先应用。
- `.tmp/verify_formula.js` — 伤害公式的 Node 沙箱校验脚本（含拆分护栏：公式唯一实现 / 关键符号存在 / `js/02-damage.js` 禁 DOM / 跨文件重名检测 / 全部来源按 script 顺序拼接解析），**改公式或搬代码后必须重跑**：`node .tmp/verify_formula.js`（当前基线 160 PASS / 0 FAIL）。`.tmp/smoke_load.js` — 加载期冒烟（带 DOM 桩按浏览器顺序加载全部来源，抓 ReferenceError）。
- `header.png` + `fonts/` — 顶栏 logo（606×109 透明 PNG，白色字 + 黄星）与顶栏专用字体。头部结构为 `.site-header > .site-header-inner`（左 logo / 中 `.site-nav` 两个 wiki 外链 / 右 `.header-actions` 日夜 + 收藏），样式在 `css/head.css` 顶部，颜色走 `--header-bg` / `--header-text` / `--nav-accent`，字体走 `--nav-font`（**仅 header 生效**，正文仍是微软雅黑）。**顶栏不再自托管中文字体**，`--nav-font` 只是系统圆体栈：`Yuanti SC` / `圆体-简`（macOS）→ `YouYuan` / 幼圆 / `SimYou`（Windows）→ 方正兰亭圆 → `PingFang SC` / 微软雅黑，缺失时逐级静默回退，因此**改头栏文案无需再重新子集化**（原「江城圆体」9 片 `nav-rounded-*.woff2` 子集及 `.tmp/build_navfont.py` 已移除）。图标用自托管的 Font Awesome 6 Free Solid（`fonts/fa-solid-900.woff2`，与 wiki 站同版本 6.0.0），`@font-face` 与 `.fa-solid` 基础类在 `css/head.css` 顶部，**需要的图标类必须手写 `::before` 码点**（当前只有 `.fa-book-open` `\f518`、`.fa-bolt` `\f0e7`、`.fa-egg` `\f7fb`），新增图标在 FA 的 all.css 里查到码点后补一条即可。
- `analytics.js` — 百度统计，勿动。
- `.tmp/` — 数据同步的中间产物、详情页缓存与本地校验脚本（已在 `.gitignore`）。

## 核心计算逻辑（按层分布于 `js/01`~`08`，见上方职责表）

- 三种模式：`switchMode()` 切换 A（快捷）/ B（参数）/ FULL（配招），互斥显示：
  - **A**：威力按「游戏内显示值」处理 —— 已含特性/克制/能级/本系/天气/印记，因此 `calc()` 内**不乘**克制、本系、能级倍率，也不套能力等级、不吃特性攻防加成；属性选择器已隐藏（`js/08-fav-init.js` 顶层 `buildTypeSelector('skill-type-selector-a')` 被注释），天气/印记控件在 A 面板也不存在。
  - **B**：`applyQuickSkill()` 选中技能后由 `syncModeBAutoFields()` 自动填克制/本系/能级倍率；威力基数 = `base-power-b` + 技能威力固定修正 + 特性威力加算 `trait-power-b`，再经 `resolveSkillPower()` 叠加技能规则 / 天气 / 印记的百分比。
  - **FULL**：`fullState` + `buildFullSkillRows()` / `openFskDropdown()` / `selectFskSkill()` / `calcOneFskDmg()` / `calcFull()` / `renderFullResult()`，攻防各 4 个技能槽；此模式下公共 `result-panel` 被隐藏。技能行 8 列中**第 7 列为伤害列**（`#fsk-dmg-cell-{side}-{i}`：总伤害 + 占受击方 HP 百分比，`title` 给出单次伤害 / 连击 / 威力链路等明细；白天伤害数字黑色、百分比按占比染色），原「修正威力」只读列已移除。`#full-result-panel` 只渲染选中技能的详细拆解，未选中时才显示引导文字（无顶部横线、无左右多技能对比列表）；点击技能行走 `selectFullSkill()` → `calcFull()`，因为行会被重建、必须重算回填伤害列。
- **伤害公式：四层拆分，唯一实现为 `computeDamage(o)`**（`calc()` 与 `calcOneFskDmg()` 都只调它，两处**不得**再出现连乘公式字面量）：
  ```
  attackValue  = (面板攻击 + Σ固定加成) × (1 + Σ特性百分比加成 + (攻击能力等级倍率 − 1))
  defenseValue = (面板防御 + Σ固定加成) × (1 + Σ特性百分比加成 + (防御能力等级倍率 − 1))
  powerSkill   = 技能威力（基础威力）
  powerBaseSeg = 技能威力 × 应对倍率(技能)                          ← 基础威力区
  powerFlatAll = 技能威力加成 + 特性威力加成                       ← 固定威力提升区（不吃应对倍率）
  powerMultAll = 1 + Σ(技能威力+N% 的 N% + 特性威力倍率的增量)      ← 技能威力乘区（跨来源相加）
  powerFinal   = (powerBaseSeg + powerFlatAll) × powerMultAll
  等级系数 = (攻击方等级 × 45/100 + 10) / 41            ← 60 级 = 37/41（旧口径）
  单次伤害= floor( attackValue / defenseValue × 等级系数 × powerFinal × 克制 × 本系 × 特性乘算 × 额外倍率 × 减伤 )
  总伤害   = 单次伤害 × 连击数
  ```
  - **等级系数与攻击方等级挂钩**：`damageLevelCoef(atkLevel)`（`js/02-damage.js`）唯一实现，`computeDamage` 的 `atkLevel` 入参由调用方传 `getEffectiveLevel('atk')`（FULL 按出手方 `_atkTraitSide`，模式 A 也传）；缺省 60 → 37/41，因此 60 级数值与旧口径完全一致。星陨追加伤害复用 `res.levelCoef`；公式串/拆解层文案由 `damageCoefLabel()` 输出（60 级仍显示 `37/41`）。
  - **攻防层加成同区相加（用户定义，勿改回连乘）**：百分比加成与「能力等级倍率」在**同一个加成乘区**里相加 ——
    `246 ×（1 + 0.40 + 1.00）= 590.4`，而不是 `246 × 1.40 × 2.00 = 688.8`（等级 +10 → 等级倍率 2.0，其贡献是增量 +1.00）。
    固定点数仍在括号内先相加；**多个特性来源之间也相加**（`collectStatBuffs().pctMult = 1 + Σpct`，2 个 +20% = +40% 而非 ×1.44）。
  - **威力公式（用户定义，不可改）**：`威力 = (基础威力区 + 固定威力提升区) × 技能威力乘区`。
    ⚠️ 三个要点：1) **基础威力区 = 技能威力 × 应对倍率**，应对倍率只放大基础威力，不放大固定威力提升区；
    2) **固定威力提升区 = 技能威力加成 + 特性威力加成**（求和）；
    3) **技能威力乘区 = 1 + Σ(技能「威力+N%」与「特性威力倍率」的增量)**，跨来源**相加**而不是连乘，
    对「基础威力区 + 固定威力提升区」整体生效：
    `75 基础 + 技能威力+50% + 特性威力倍率 1.50 → (75 + 0) × (1 + 0.5 + 0.5) = 150`（旧口径 `(75×1.5)×1.5 = 168.75` 已废弃）。
  - **通道归属**：`powerMult`（应对倍率「×N / 威力翻倍」）与 `powerPct`/`powerAdd` 来自 `data/skillMult.js`；`powerTraitMult`（特性威力倍率，以 `倍率−1` 的增量并入技能威力乘区）与 `powerTraitBonus`（特性威力加成，进固定威力提升区）来自 `data/traitMult.js`；愿力冲击「应对状态→×2.5」同样走 `powerMult`。`powerPct` 里还有两个非规则来源：天气（雨天→水系 +75%，`ctx.weather`）与进攻方印记（每层百分比，`ctx.mark`），三者与技能规则**同区相加**。
  - **取整位置**：`Math.floor(单次) × 连击`，即先对单次取整再乘连击（与改造前一致，勿改）。
  - 模式 A 走同一条路径：传 `useLevel:false, typeEff:1, stab:1` 且不吃特性 buff。
  - `o` 入参关键字段：`atkBase/defBase`、`atkLevel`(攻击方等级，缺省 60 → 等级系数 37/41)、`atkFlat/atkPctMult/atkLevelMult`、`defFlat/defPctMult/defLevelMult`、`powerBase`(技能威力)/`powerMult`(应对倍率)/`powerTraitMult`(特性威力倍率)/`powerPct`/`powerAdd`(技能加成)/`powerTraitBonus`(特性威力加成)`、`typeEff/stab/traitMult/extraMult/reduceMult/hits`。返回值含 `layers` 所需全部中间量（`attackValue/defenseValue/powerBase/powerFinal/singleDmg/dmg`）。
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
  | `pwM` | 特性威力倍率 | 威力层技能威力乘区（以 `倍率−1` 的增量参与求和） |
  | `pwA` | 特性威力 | 威力层固定威力提升区（与技能威力加成求和） |
  | `atkM` | 特性攻击倍率（防方：特性防御倍率） | 攻击层 / 防御层 |
  | `atkA` | 特性攻击（防方：特性防御） | 攻击层 / 防御层 |
  - **`mult` 可并列**：登记多个通道时对应输入框一起显示；未登记任何具体通道才退化为只显示「特性倍率」。
  - **按侧声明**：同一特性攻/防侧落在不同层时登记 `{ sides: { atk: <ch>, def: <ch> } }`，由 `getTraitChannelsForSide(name, side)` 分别解析（例：圣龙的守护攻方显示「特性攻击倍率」、防方显示「特性倍率」，与冥古龙的防方易伤口径一致）。
  - **显隐依据是「规则声明了哪些通道」，不是「条件当前是否满足」**：如 `蒸汽膨胀` 声明 `powerBonus`，即使层数 0 也只显示「特性威力」，不退化为「特性倍率」。未登记的特性 → 只显示「特性倍率」。
  - **手动覆盖 + 自动回填共存**：`updateTraitInputVisibility()` 用「输入源签名」（特性名 + 该侧全部条件输入）判断数据来源是否变化 —— 变化（换精灵/换技能/改条件）则清 `data-user-edited` 并回填规则值；不变（仅普通重算）则保留手填值。`onTraitInputEdit()` 打标记。
  - **重置 = 回到无加成基线**：`resetTraitInput()` 清该侧全部手动标记 → 条件输入框恢复规则声明默认值（次数 → 0，复选框 → 默认勾选）→ 重跑规则，倍率回到 `1.0`、加成回到 `0`。id 规则见 `traitInputId(kind, mode, side)`；`readTraitInputs()` 对隐藏项回退为规则计算值，不会重复叠加。
  - **面板布局与规则提示**：特性名与描述同行包在 `.trait-head-row`（窄屏自动换行）；每个输入组末尾带「重置」按钮，触发 `resetTraitInput(mode, side, kind)`；规则提示由 `renderTraitNote()` 写入倍率行末尾的 `#trait-{side}-note-{mode}`（`.trait-name-note`，攻橙防蓝，空则隐藏），不再拼进特性名元素。
- **技能威力修正**：`data/skillMult.js`（101 条规则）。`resolveSkillPower(skill, ctx)` 返回 `{powerAdd, powerPct, powerMult, hitsSet, label, hasRule, unimplemented}`。条件字段渲染 `renderPowerCond()` / `onPowerCondChange()` / `readPowerOptsByMode()`，id 命名空间 `pwr-opt-{mode}-{slot}-{key}`（与 `trait-opt-*` 隔离）。`ctx.util` 由 `buildPowerUtil()` 注入（查表函数 + 面板值 + 敌方技能槽能耗/威力），**规则表内不碰 DOM**。`ctx.weather`（`rain`/`blizzard`）与 `ctx.mark`（`getMarkInfo()` 返回值）也在该函数内并入 `powerPct`，因此**无规则的技能同样吃天气/印记加成**。
  - **未实现规则不提示**：`isSkillPowerUnimplemented()` 与 `resolveSkillPower()` 返回的 `unimplemented` 标记仍保留在 `data/skillMult.js`，但 UI 不再显示 `.power-mod-warn` 警告条（该样式已删除）—— 无规则的技能静默按基础威力计算，由用户自行手动填写威力/连击。
  - 变动威力查表：`SPEED_DIFF_TABLE`（闪击）、`PDEF_DIFF_TABLE`（鸣沙陷阱，与前者同一数组引用）、`MANA_BURST_TABLE`（魔能爆，本次新增接入自动回填）、`冰锋横扫`（敌方总能耗×10）、`怨力打击`/`钢钻`（公式型，`p:1` 为占位值）。`diffTableLookup()` 由 `util` 注入。FULL 模式经 `resolveAutoPowerForSlot()` 统一解析，**`buildFullSkillRows`/`calcOneFskDmg` 内不再有逐个 `if (sk.n === ...)` 硬编码**。
  - 愿力冲击为 18 条运行时注入（带 `desc`，`k:'双攻'` 取物攻/魔攻较高者）；「应对状态→威力×2.5」已在 `data/skillMult.js` 注册规则，条件框由 `renderPowerCond()` 在模式 B / FULL 技能槽渲染（走 `powerMult`，且应对倍率只作用于威力层的基础段），FULL 的 `?` 备注只剩说明文字。
- **结果栏四层拆解**：`renderLayersHtml(o)` 单一渲染函数，模式 B（`calc()`）与 FULL（`renderFullResult()`）**共用**，产出 4 个 `.breakdown-group`（攻击层橙 / 防御层蓝 / 威力层紫 / 结算层accent），子项 `　└ ` 前缀表示来源明细；`×` / `＋` 只出现在**数值列**，label 只写名称（缩进用 `　` / `　└`），避免「× 应对倍率 ×3.00」这种重复。星陨区块不走 `renderLayersHtml`，由 `calc()` / `renderFullResult()` 各自独立成块渲染。
- 星陨印记：输入层数 `x` 后追加幻系伤害，威力 = `x² + 24x − 24`；**幻系技能不触发**（输入框自动禁用）；A/B/FULL 均支持。**口径以代码为准**：复用主伤害的 `res.attackValue` / `res.defenseValue` 与 `res.levelCoef`，因此**吃攻防特性 stat 加成与能力等级**；只再乘幻系克制与减伤，**不吃**本系、特性结算倍率（`traitMult`）、额外倍率。B 在 `js/06-calc-ab.js`、FULL 在 `js/07-full.js`，两处公式必须保持一致。
- **天气（全局参数，仅 B / FULL）**：`state.weather`（`none` / `rain` / `blizzard`）+ `#weather-b` / `#weather-full` 下拉，切换走 `onWeatherChange()`。两条独立链路：
  - **雨天 → 水系技能威力 +75%**：在 `data/skillMult.js` 的 `resolveSkillPower()` 内并入 `powerPct`（与技能规则同区相加，说明文字拼进 `label`），`computeDamage` 不感知天气。
  - **暴风雪 → 只回填条件默认值**：`weatherCondDefault(key, def)` 对 `key === 'blizzard'` 返回「当前天气是否为暴风雪」，作用于 `renderPowerCond`（雪原狩猎 `pwr-opt-*-blizzard`）、`renderTraitCond`（冰雪魂魄 `trait-opt-*-blizzard`）及两处 reset。切天气时 `applyWeatherToConds()` 直接改写已存在勾选框并同步 FULL 槽位 `pwrOpts.blizzard`，再 `bumpTraitOptsVersion` + `autoUpdateTraitUI()` 让条件签名缓存失效。
  - **模式 A 不参与**（威力是游戏内显示值，已含天气），因此 A 面板没有天气下拉。
  - ⚠️ 新增「天气为 X」类条件时字段 `key` 必须为 `blizzard` 才会被联动；其它天气需同时扩展 `weatherCondDefault()` 与 `applyWeatherToConds()` 的选择器。
- **进攻方印记（全局参数，仅 B / FULL）**：⚠️ 与上面的「星陨印记」无关 —— 星陨是幻系追加伤害，进攻方印记是**技能威力百分比**。`state.marks` 为数组 `[{ key, stacks }]`（游戏内可多印记并存），`MARK_TABLE` 定义 `charge` 蓄势 30% / `tailwind` 风起 20% / `attack` 攻击 10% 每层；`getMarkInfo()` 汇总 `{ entries, pct, label }`（跨印记百分比**相加**），经 `buildPowerCtx`/`buildFullPowerCtx` 的 `ctx.mark` 传入 `resolveSkillPower()`，同样并入 `powerPct`（技能威力乘区）。
  - UI 只实现「1 种印记」编辑入口（`#mark-b` / `#mark-full` + `#mark-stacks-*`，层数 0–99、无印记时禁用），`syncMarkUI()` 只读写数组第 1 项，多选 UI 未实现。
  - **印记属于进攻方**：FULL 模式防御方技能槽（`def0`~`def3`）`ctx.mark = null`，不吃我方印记。
- **模式 A/B/FULL 吸底结果条**：`#result-dock`（`index.html` body 末尾，`position:fixed` 底部居中），伤害栏滚出视口时显示，展示「模式徽标 + 攻→防（FULL 另带技能名）+ 伤害 + 血量%」，点击 `scrollIntoView` 回到对应结果面板。A/B 内容由 `calc()` 末尾的 `updateResultDock(info)` 写入、锚点 `#result-summary`；**FULL 由 `renderFullResult()` 在选中技能且造成直接伤害时写入**（`mode:'FULL'` / `skillName` / `dmg` / `pct`），锚点为详情大数字 `#full-result-summary`，未选中技能 / 状态技能 / 未选齐精灵时 `clearResultDock()`。`dock.dataset.ready='1'` 表示有结果；显隐判定 `syncResultDockVisibility()` 按 `state.mode` 选锚点读 `getBoundingClientRect()`（纯读取，无 DOM 写入），FULL 徽标走 `.is-full`（青色）；`switchMode()` 与未选精灵分支分别刷新/清空。滚动/resize 监听与点击绑定在 `js/08-fav-init.js` 的 `initResultDock()`，用 `requestAnimationFrame` 节流。
- 特性倍率：`calcAtkTraitMult` / `calcDefTraitMult`（现返回 `powerBonus`/`powerPct`/`stat`）；条件输入用 `getTraitNeedsInput` / `getDefTraitNeedsInput` + `renderTraitCond()`，`onTraitCondChange()` / `readTraitOptsByMode()` 读写（后者改为**按 id 前缀全量扫描**，新增 key 无需改代码）。
- 属性克制：`getTypeEff`（含免疫判定）；本系加成判定 `hasStab`。
- 属性折算：`calcRealStat(sv, iv, nature, isHp, level)`（含性格 `getNature()`、个体值、精灵等级）、`readIV()` / `setIv()`（个体值只有 **0 / 60** 两档）、`levelMult()`（能级倍率 = 1 + 0.1 × 等级，负级取倒数，与精灵等级无关）。
  - **面板值公式（等级化）**：`每级加值 = 0.01 × 种族值 + 0.005 × 个体值`；生命 `= ((10 + 等级) + 每级加值 × (50 + 等级×2)) × 性格加成 + 100`；五维 `= (10 + 每级加值 × (50 + 等级)) × 性格加成 + 50`；每级加值以整数分子 `per200 = 2×种族值 + 个体值`（即 ×200）参与运算，避免浮点误差推过 `.5` 取整边界。
  - **精灵等级是隐藏属性**：`state.atkCharLevel` / `state.defCharLevel`，默认 `SPIRIT_LEVEL_DEFAULT = 60`（1–100 钳制），UI 无入口；基础等级由 `getSpiritLevel(side)` 读取，**生效等级**由 `getEffectiveLevel(side)` 给出：持有等级类特性（`data/traitMult.js` 的 `TRAIT_LEVEL_RULES`，如「恶龙的奢望」= 手填等级，默认 99、步进 10）时取手填值，否则取基础等级 60；`recalcStats(side)` 逐项传入 `calcRealStat`。60 级时即旧口径：生命 `1.7×种族值 + 0.85×个体值 + 170`、五维 `1.1×种族值 + 0.55×个体值 + 60`。卡片标题行末尾显示 `Lv.生效等级` 徽标（`#spirit-level-{side}`，`renderCard` 生成、`recalcStats` 刷新）；**生效等级 = 60（默认）时隐藏**，非 60 才显示。
  - ⚠️ **取整特例**：种族值 105 + 个体 0 + 无性格加成时，中间值 `.5` 向下取整（游戏内截断，针叶巡林 HP 348 / 迪莫防御 175），其余情况四舍五入；改造公式后须保持这三个验证值（另含 水灵 HP 501 = 种族 125 + 个体 60 + HP 性格）。
- 搜索：`matchQuery()` 是基础匹配（中文子串 / 全拼 `toPinyin()` / 首字母 `toInitials()`），实际列表过滤已改走带相关度排序的 `filterSpiritsByQuery()` / `filterSkillsByQuery()`（`js/01-core.js` 懒建索引，匹配集合与 `matchQuery` 一致；`toPinyin()`/`toInitials()` 都基于 `toPinyinSyllables()`——先按 `PINYIN_WORDS` 词组覆盖表做最长 4 字匹配，再逐字查 `PINYIN_MAP`，多音字如「长江豚」(chang-…)、「海豹船长」(…-zhang) 按词取音；索引存逐字音节 `syl`，`pinyinSegmentMatch()` 让 `hu` 命中 `九尾狐`(jiu-wei-hu) 而非 `shui` 的跨音节串，`searchScore()` 排序为「名称 > 拼音前缀 > 整音节 > 音节前缀 > 跨音节子串 > 首字母」）。精灵下拉 `setupSearch()` 无输入时按 `a1` 属性分组（默认折叠、显示数量），有输入时扁平过滤，**最多渲染 100 条**（超出显示「共 N 条匹配」提示）；技能下拉（B 模式 `renderComboPanel` / FULL `openFskDropdown`）同样按相关度排序但**全量渲染不截断**。输入经 `requestAnimationFrame` 节流。
- 持久化：收藏夹用 `localStorage`（键 `roko_favorites` / `roko_fav_panel_open` / `roko_fav_panel_pos`，`loadFavorites`/`saveFavorites`，浮层可拖动 `setupFavPanelDrag`/`applyFavPanelPos`）；主题 `toggleTheme()` 切 `data-theme="light"`，**默认日间且不持久化**。

## 更新游戏数据（常见任务）

- **不要凭记忆手写精灵/技能数值** —— 使用 `.codebuddy/skills/` 下的 AI 技能（注意目录名与技能 `name` 不完全一致）：
  - `sync-spirits`（目录 `.codebuddy/skills/sync-spirits/`）：按编号范围批量从 wiki 同步。`scripts/sync_spirits.py` 编排（内部调用 `extract_spirits.py` 解析图鉴页、`fetch_spirit_detail.py` 解析详情页），加 `--merge` 才写入 `data/spirits.js`（写前备份到 `.tmp/spirits.js.bak`），不加则只产出 `.tmp/spirits_full.json`。依赖 `requests` + `beautifulsoup4`；详情页缓存在 `.tmp/spirit_details/`。
  - `sync-skills`（目录 `sync-skills/`）：从技能图鉴同步，`scripts/fetch_skills.py` 抓取（`requests` + `bs4`）→ `scripts/convert_skills.py` 转成 `data/skills.js`；会过滤掉状态/防御类技能，中间 JSON 输出到 `.tmp/`。
  - `add-spirit`（name: `add-spirit-skill`）：手动新增单只精灵。
  - `update-spirit`（name: `update-spirit-stats`）：修改已有精灵的资质等字段。
- 同步脚本在**项目根目录**执行（脚本内部用相对路径 `.tmp/`、`data/`），PowerShell 下不要用 `cd /d`。
- 同步失败多为 wiki 的 WAF `567` 间歇拦截：单只失败不中断整轮，失败精灵不写库，直接重跑同一命令即可收敛（实测全量 624 只 2–4 轮成功）。
- 向 `SPIRITS` 追加时：插在最后一个 `}` 之后、`]` 之前；用 `no`+`n` 组合去重；4 空格缩进。
- 新增/改名后运行 `python gen_pinyin.py` 重建拼音映射，否则新名字搜不到。

## 约定与已知坑

- 所有用户可见文案为**简体中文**；文件编码 UTF-8（部分 CRLF 行尾）。终端输出中文出现乱码通常是显示端解码问题，文件本身有效，**不要"修复"编码**。
- UI 遵循"攻橙防蓝"语义：攻击方暖色、防御方冷色，始终成对出现（详见 design.md）；**默认日间主题且刷新后不保留**切换结果。
- 「其他额外倍率 / 星陨印记层数 / 防御方减伤」三组输入框是 `.num-combo` 数值下拉（A/B/FULL 各一份，共 9 个）：预设值由 input 的 `data-num-opts` 声明，`initNumCombos()`（`DOMContentLoaded` 调用）构建选项；点选项后写值并派发 `input` 事件以复用各模式原有的 `oninput`（`calc` / `calcFull`），仍允许自由输入，失焦时空/非数字回填 `defaultValue`。**布局约束**：`.mult-box` 是 `flex:0 0 auto`，宽度由内容（label + input 固有宽度）撑开，故这些 input 在 `head.css` 中固定为 `width:0; min-width:100%` —— 否则 `type=text` 的固有宽度会把整行撑宽（110px → 229px）；同时不要给它们加左右 padding。
- `data/*.js` 与 `js/*.js` 都不能移回 `<head>` 或加 `defer`、禁 `type="module"`：经典脚本在解析期立即执行并依赖全局常量，`file://` 下 module 还会被 CORS 拦掉整页白屏；执行顺序颠倒会直接 ReferenceError 崩掉整个脚本。`js/` 内部顺序同样不可重排（愿力冲击注入依赖 `data/skills.js`；08 的 init 依赖 01~07 全部声明）。
- 模式 A 不计算克制/本系/能级（威力已包含），不要"顺手补齐"；模式 B 的倍率框可手动覆盖自动值，`syncModeBAutoFields()` 只在切精灵/切属性时重填。
- 天气与进攻方印记同样是 **B / FULL 专属**的全局参数（A 模式威力已含），不要给 A 模式补算；二者最终都只流入 `resolveSkillPower().powerPct`（技能威力乘区），**不要**另开一条独立乘区，否则与威力口径分叉。
- 切天气会覆写用户手动勾选的 `pwr-opt-*-blizzard` / `trait-opt-*-blizzard`（预期行为）；`calc()` 内 `renderPowerCond()` 必须排在 `resolveSkillPower()` **之前**，否则首次计算读不到天气决定的默认勾选态。
- `st` 是特殊形态/阶段文本（如「首领」）而非进化阶段；`SORTED_SPIRITS` 只是 `SPIRITS` 的别名（定义在 `js/05-card.js`，被搜索分组与索引使用，**不是死代码**），不要假设它已排序。
- FULL 模式下 `calcFull()` 在攻防双方未选齐时提前返回，两侧技能面板标题保持「未选择精灵」——这是现有约定，不是 bug。
- 技能库当前没有 `k === '状态'` 的数据，但下拉渲染与 FULL 计算仍保留该分支（单独分组、"不造成直接伤害"提示），删数据分支前请先确认同步侧不会再加回。
- `index.html` 现在只有约 546 行 HTML；改逻辑去对应的 `js/*.js`（职责表见上），改数据去 `data/*.js`。编辑 `js/*.js` 后跑 `node .tmp/verify_formula.js` + `node .tmp/smoke_load.js`。
- 公式**只有** `computeDamage()` 一个实现点。看到别处出现 `* (37/41) *` / `levelCoef` 之类的字面量即为分叉，必须收敛回 `computeDamage()`（等级系数取 `damageLevelCoef()`）。
- 新增特性攻防规则时：若特性语义是「改攻防属性」而非「改伤害倍率」，用 `stat` 通道并把 `f` 置 1，**不要**两者都写。
- 新增技能威力规则时：在 `data/skillMult.js` 用 `defineSkillPowerRule` 注册；「变为 N 倍」用 `powerMult`（乘除段），「+N / +N%」用 `powerAdd` / `powerPct`（`powerAdd` 进加减段）。字段构造器用 `spCk` / `spNum`（**不要**用 `ck` / `num`，那是 `traitMult.js` 的全局名，重复声明会崩）。
- `data/skillMult.js` 与 `data/traitMult.js` 都**不得**引用 `SPEED_DIFF_TABLE` / `MANA_BURST_TABLE` / `diffTableLookup` 等 `js/01-core.js` 内的绑定（加载期它们还不存在）；一律通过 `ctx.util` 注入。
- 特性输入框的自动回填靠「输入源签名」（特性名 + 条件输入）判断：条件一变就清手动标记并回填规则值。若在 `calc()` 的重算路径里无条件回填，会把用户手填值冲掉。
- 特性规则未覆盖但 `tr_desc` 含攻防关键词时，需给用户「规则待补全」提示，不要静默按无加成处理（与技能侧 `isSkillPowerUnimplemented` 同理）。
