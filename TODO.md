# TODO — index.html 拆分与瘦身

> 记录于本次会话。目标：`index.html`（实测 **4784 行**，行内 `<script>` 为 630–4783）拆成可维护的经典脚本结构，
> **不引入构建系统，`file://` 双击打开必须继续可用**。

## 审查基线快照（2026-10-17 实测，动工前以本节为准，勿照记忆）

| 项 | 原记录 | 实测 |
| --- | --- | --- |
| index.html 行数 | ~4700 | **4784**（行内 script 630–4783，HTML 1–629） |
| `node .tmp/verify_formula.js` | 127 PASS / 0 FAIL | 修复后 **131 PASS / 0 FAIL，退出码 0**（修复前 83 PASS / 1 FAIL 且脚本末尾崩溃，110 条 eq/near 断言仅执行 84 条） |
| `js/` 目录 | 规划中 | 不存在 |
| 特性面板复制 | 「trait-panel ×4」 | 无 `trait-panel` 这个 id；实际是 `trait-inputs-{mode}-{side}` + `trait-{side}-cond-{mode}` 各 4 份（行 277–306 / 313–342 / 491–520 / 527–556），每份约 30 行 |
| 死代码 CSS | 「已无引用」 | 已确认：`.quick-mult-btn` / `.reduce-input` / `#trait-desc-b` 仅存在于 `css/head.css`，index.html 无引用，可删 |

**基线两个必修项 —— 已于 2026-10-17 修复完成（131 PASS / 0 FAIL）**：

1. `[FAIL] powerMultAll = counter x pct = 3`：**断言语义过期，代码不用改**。现行 `computeDamage` 按 AGENTS.md 新口径把应对倍率并入基础威力区（`powerBaseSeg = 技能威力 × 应对倍率`），`powerMultAll = 1 + 技能威力+N% + (特性威力倍率−1)` 不含 counter。把该断言期望值 3 改为 1.5（或改断言 `powerBaseSeg === 300`）。
2. 第 216 行 `ATK_TRAIT_RULES['月光审判'].eff({def:{st:'首领'}})` 抛 `TypeError: Cannot read properties of undefined (reading 'enemyIsBoss')`：规则已从「自动读 `def.st`」改为手动勾选 `ck('enemyIsBoss')`，测试入参缺 `opts` → 改为 `.eff({opts:{enemyIsBoss:true}})`。
   - 验收：`node .tmp/verify_formula.js` → **110 PASS / 0 FAIL** 且正常打印汇总行、退出码 0。

## 硬约束（拆分的全部前提）

- ❌ 不用 `type="module"`（`file://` 下会被 CORS 拦掉，整页白屏）
- ❌ 不加 `defer` / 不把 `data/*.js` 移回 `<head>`（现有约束：行内脚本解析期立即执行，依赖全局常量）
- ✅ 拆分出的 `js/*.js` 全部是**经典脚本**，共享同一全局作用域，加载顺序即依赖顺序
- ✅ 顶层语句分级放行（原文「只能放最后一个文件或 DOMContentLoaded」与 Phase 1 搬迁愿力冲击注入自相矛盾，改为）：
  - **数据注入**（愿力冲击 `SKILLS.push`，651–652 行）允许在 `js/01-core.js` 顶层执行，前提是排在 `data/*.js` 之后、任何读取 `SKILLS` 的代码之前
  - **DOM 绑定 / init 入口**只能放最后一个文件或 `DOMContentLoaded` 内
- ✅ 经典脚本之间**不允许重名**顶层 `const/let/function`：第二个文件加载即 SyntaxError，整页白屏（现有全局符号已很多，搬完一个 Phase 就跑一次页面就是为抓这个）
- ✅ 公式只有 `computeDamage()` 一个实现点；`calc()` / `calcOneFskDmg()` 都只调它，不新增第二份 `* (37/41) *` 字面量
- ✅ **每个 Phase 一个 git commit**（master 当前干净）；动工前 `git tag pre-split-index`，回滚优先用 git，`.tmp/*.bak` 只是兜底（`.tmp` 已 gitignore，不能当主备份）

## 现状结构（行范围按 4784 行实测校准）

| 区块 | 行范围 | 约行数 |
| --- | --- | --- |
| HTML（head / header / 精灵卡 / 模式面板 / 收藏浮层 / 弹窗） | 1–629 | 629 |
| `data/*.js` 脚本标签（顺序敏感，622–628） | 622–628 | 7 |
| 拼音/搜索匹配 + 愿力冲击注入(651) + `state`(660) + 面板值计算 | 630–682 | 53 |
| 特性规则调用层（`calcAtkTraitMult` 741 / `calcDefTraitMult` 791 / `checkDefCarriesAttr` 843） | 683–831 | 149 |
| `collectStatBuffs`(889) + **`computeDamage`(937)** + `buildPowerUtil`(1004) + 性格表 + helpers | 833–1140 | 308 |
| `switchMode`(1187) / **`calc()`(1208)** / `mergeBuffSourcesList`(1499) / **`renderLayersHtml`(1506)** | 1141–1566 | 426 |
| 能力等级 / 交换 / 特性面板 UI 全套 | 1567–2330 | 764 |
| 技能下拉 picker + `buildPowerCtx`(2374) + `getFskPowerTipHTML`(2713) 硬编码提示表 + 查表常量 `SPEED_DIFF_TABLE`(2646)/`PDEF_DIFF_TABLE`(2660)/`MANA_BURST_TABLE`(2671) | 2331–2900 | 570 |
| `renderCard`(3158) / `setupSearch`(3389) / `initNumCombos`(3308) / 收藏面板渲染 | 2901–3345 | 445 |
| INIT（`SELECT_ON_FOCUS_SELECTOR` 3543 / `toggleTheme` 3549） | 3346–3567 | 222 |
| FULL 模式（`fullState` 3568 / `buildFullSkillRows` 3599 / `resolveAutoPowerForSlot` 3809 / `findFullSlotRef` 4079 / `calcOneFskDmg` 3942 / `calcFull` 4106 / `renderFullResult` 4170） | 3568–4365 | 798 |
| 收藏 / 通用弹窗 / IIFE / `DOMContentLoaded`(4770) | 4366–4783 | 418 |

## Phase 0 — 修绿基线 + 立护栏（先做）

- [x] **修绿基线**（见上「基线两个必修项」，2026-10-17 已完成：131 PASS / 0 FAIL，退出码 0）
- [x] `git tag pre-split-index`（2026-10-17 已建）；备份 `index.html` 到 `.tmp/index.html.<时间戳>.bak`（兜底，不作主回滚手段）
- [x] **切换断言数据源（关键，不做这步 Phase 1 一搬函数全部断言立刻找不到）**：现行断言用 `extractFunc(html, name)` 从 `index.html` 抽 `computeDamage` / `collectStatBuffs`；改为按 `index.html` 中 `<script>` 出现顺序拼接 `data/*.js` + `js/*.js` 文本后抽取，**公式断言零改动保留**（第 13 组函数定义类检查同步改查全来源）
- [x] 新增正则断言：`computeDamage` 函数体在全部来源文件中**只允许出现一次**
- [x] 新增符号存在性断言：`computeDamage` / `collectStatBuffs` / `calc` / `calcOneFskDmg` / `renderLayersHtml` / `resolveAutoPowerForSlot` / `findFullSlotRef` / `buildPowerCtx`
- [x] 新增纯净性断言：`js/02-damage.js` 源码不出现 `document.` / `window.` / `getElementById`（computeDamage / collectStatBuffs / applyStatBuff / buildPowerUtil / mergeBuffSourcesList / renderLayersHtml 均为纯计算或纯字符串，防 DOM 依赖回潮）。注意 **01-core 不适用**此断言：`readIV`/`setIv`/`toggleIV`(690–712) 本身读写 DOM，属既有事实，后续可随 UI 层再迁
- [x] 附带护栏：跨文件重名顶层声明检测（同文件内遮蔽声明只警告）——已抓到 `readTraitOpts` 在 index.html 内被声明两次（1026 死代码 / 2170 兼容包装），列入 Phase 6 清理

## Phase 1 — 搬纯逻辑（零 DOM 依赖，先验证 `file://` 链路）

- [ ] `js/01-core.js`（约 230 行）：`toPinyin` / `toInitials` / `matchQuery`、愿力冲击运行时注入、`state`、`calcRealStat` / `readIV` / `setIv` / `toggleIV`、性格表、`f1` / `f2` / `diffTableLookup` / `levelMult` / `getTypeEff` / `hasStab`，**以及三个查表常量** `SPEED_DIFF_TABLE` / `PDEF_DIFF_TABLE` / `MANA_BURST_TABLE`（2646–2680，纯数据；`buildPowerUtil` 与 04-power.js 都依赖，不搬则「零 DOM」名不副实）
- [ ] `js/02-damage.js`（约 350 行）：**`computeDamage`**、`collectStatBuffs`、`applyStatBuff`、`buildPowerUtil`、`mergeBuffSourcesList`、`renderLayersHtml`（均为计算/纯字符串，可最先搬）
- [ ] `index.html` 用 `<script src="js/01-core.js"></script>` + `js/02-damage.js` 替换对应片段（置于 data 脚本之后、剩余行内 script 之前）
- [ ] 验证：`node .tmp/verify_formula.js` 全绿 + `file://` 打开无 ReferenceError
- [ ] 验证：模式 A / B 各选一次攻防，结果数字与拆分前逐位一致
- [ ] commit：`refactor: 拆分 01-core / 02-damage`

## Phase 2 — 搬特性层与威力桥接层

- [ ] `js/03-trait.js`（按「计算 / UI」再裂，单文件控制在 500 行内）：
  - 计算：`calcAtkTraitMult` / `calcDefTraitMult` / `getTraitNeedsInput` / `getDefTraitNeedsInput` / `checkDefCarriesAttr`
  - UI：`updateTraitPanelForMode` / `updateTraitInputVisibility` / `readTraitInputs` / `traitInputEffective` / `renderTraitCond` / `onTraitCondChange` / `resetTraitInput` / `autoUpdateTraitUI` / `refreshStatAreas`
  - 边界说明：03 的 UI 函数只通过 `traitInputId(kind, mode, side)` / `trait-opt-*` 读写 DOM，不做布局；卡片级交互归 05
- [ ] `js/04-power.js`（约 500 行）：`renderPowerCond` / `readPowerOptsByMode` / `buildPowerCtx` / `buildFullPowerCtx` / `resolveAutoPowerForSlot` / `getFskPowerTipHTML` / `updatePowerTip` / `traitPowerFor`
- [ ] 重点回归（见文末「本次已改动（下次回归重点）」）
- [ ] commit：`refactor: 拆分 03-trait / 04-power`

## Phase 3 — 搬 UI 层

- [ ] `js/05-card.js`（约 500 行）：`renderCard` / `setupSearch` / 特性·能力等级·IV 交互 / `swapSides`
- [ ] `js/06-calc-ab.js`（约 450 行）：`switchMode` / **`calc()`** / 模式 A·B 结果栏
- [ ] `js/07-full.js`（约 900 行）：`fullState` / `buildFullSkillRows` / `openFskDropdown` / `selectFskSkill` / `calcOneFskDmg` / `calcFull` / `renderFullResult`
- [ ] `js/08-fav-init.js`（约 450 行）：收藏面板 / `loadFavorites`·`saveFavorites` / 拖动浮层 / `toggleTheme` / 通用弹窗 / 全部事件绑定 / `DOMContentLoaded` 入口（**顶层可执行语句只允许出现在这里**）
- [ ] 目标：`index.html` 收缩到约 630 行纯 HTML + 约 17 行 script 标签（data 7 + js 8 + analytics 1 + 注释）
- [ ] 验证：模式 A / B / FULL 三点手测（选精灵 → 调参数 → 核对结果数字与四层拆解项）
- [ ] commit：`refactor: 拆分 UI 层（05–08），index.html 仅留 HTML`

## Phase 4 — HTML 模板化（消除 4 份复制）

- [ ] 把 `trait-inputs-{mode}-{side}` + `trait-{side}-cond-{mode}`（b/full × atk/def 共 4 份近似 markup）改为 JS 模板函数 `traitPanelHTML(side, mode)`，在 `switchMode` / `DOMContentLoaded` 首次渲染时注入（调用点必须在 08 文件加载完成后）
- [ ] 收益：改一次通道输入框不用改 4 处；`index.html` 再减约 120 行
- [ ] 注意：id 命名规则 `traitInputId(kind, mode, side)` 与 `trait-opt-{mode}-{side}-{key}` 保持不变，`readTraitOptsByMode` 的前缀扫描逻辑才不用改

## Phase 5 — 性能优化（拆文件之外的真实卡点）

- [ ] **结果栏重绘拆分**：`calc()` 每次 `oninput` 都整块 `innerHTML` 重建（四层拆解 + 公式行 + 星陨，400+ 行字符串拼接）；FULL 还要对 4+4 槽各跑一次 `calcOneFskDmg` + `renderPowerCond`（重建条件框 DOM）→ 拆成「结构重建」与「数值更新」两步，输入时只 `textContent` 更新数值
- [ ] **输入节流**：`calc()` / `calcFull()` 的 `oninput` 入口加 `requestAnimationFrame` 节流（与搜索同款），连续按键只算最后一帧
- [ ] **输入源签名**：`updateTraitInputVisibility` 每次重算都 `JSON.stringify(readTraitOptsByMode())` 读 DOM 并序列化 → 改成条件 change 时更新缓存，或先比 key 集合再比值
- [ ] **搜索**：每次按键遍历 622 精灵并现算拼音 → 数据加载后建一次 `Map(名 → 全拼/首字母)` 索引；输入用 `requestAnimationFrame` 节流
- [ ] **提示表数据化**：`getFskPowerTipHTML` 里闪击 / 鸣沙陷阱 / 魔能爆 / 位置加成 / 应对状态是硬编码 `if` 链，与 `data/skillMult.js` 规则表两处维护 → 抽成 `data/skillTips.js`

## Phase 6 — 清理与文档

- [ ] 死代码：注释掉的 `buildTypeSelector` 块；`.quick-mult-btn` / `.reduce-input` CSS（head.css 548–549 / 249 / 649）、移动端 `#trait-desc-b` 规则（645）——已确认 index.html 无引用，直接删
- [ ] `SORTED_SPIRITS` 只是 `SPIRITS` 的别名，grep 确认无外部依赖后删除
- [ ] 每个 `js/*.js` 文件头写「加载顺序位次 + 依赖声明」；`index.html` 的 script 标签区加注释：**顺序不可重排**（愿力冲击注入依赖 data 先加载；08 的 init 依赖前面全部声明）
- [ ] 更新 `AGENTS.md`：
  - `index.html` 实际 4784 行（原文写的「175KB / 约 3280 行」已过期）
  - 新增「`js/*.js` 职责 + 加载顺序」表格
  - 写明「顶层可执行语句分级规则：数据注入限 01-core；DOM 绑定/init 限 08 或 DOMContentLoaded」
  - 写明「经典脚本、禁 `type="module"`、禁 `defer`」的原因（`file://` CORS + 解析期依赖）
  - 写明「经典脚本间禁止重名顶层声明」

## 命名空间（待定，先不阻塞）

- [ ] 讨论：拆分后是否收进 `window.App = {}`（更干净，但要同步改大量 inline `onclick` 的全局调用）
- [ ] 倾向：**先保留裸全局**，等拆分稳定后再单独做命名空间迁移（零风险、可回滚）

## 本次已改动（下次回归重点）

- [ ] 移除了模式 B 的「🔄 自动填入 / 同步」整栏与 4 个输入框（`type-eff` / `stab` / `atk-level-mult` / `def-level-mult`），`calc()` 改为直接调 `getTypeEff` / `hasStab` 计算
- [ ] 模式 A / B 参数区改为 FULL 的 `mult-box` 横向行样式，提示信息移到行右侧；模式 A 的提示按要求恢复到上方
- [ ] `SELECT_ON_FOCUS_SELECTOR` 从 id 白名单改为 `.mult-box-input, .field-input, .fsk-hits, .fsk-power, .trait-mult-input, [id^="trait-opt-"], [id^="pwr-opt-"]`
- [ ] 「已选：」信息行新增 `| 能耗 N`
- [ ] **特性防方通道修复**（重点）：新增 `getTraitChannelsForSide(name, side)`，防方面板只显示 `DEF_TRAIT_RULES` 真正会产生的通道；`calc()` 的 `traitPowerBonusFinal` 只取 `atkIn.powerAdd`；`calcOneFskDmg()` 的威力通道只取本方向出手方；`traitInputEffective()` 改为按 `[data-trait-input]` 分组判断可见性
- [ ] 移动端媒体查询改用 `.mode-param-row` 选择器（原来靠内联样式字符串匹配）
- [ ] 回归验证：蒸汽膨胀当防方 → 只显示「特性倍率 1.0」，且不参与攻方伤害

## 验证清单（每个 Phase 结束都要跑）

- [ ] `node .tmp/verify_formula.js`（当前基线：131 PASS / 0 FAIL）
- [ ] `file://` 直接打开 `index.html`，控制台无 ReferenceError
- [ ] 模式 A：选攻防 → 输入游戏内威力 → 核对结果与公式串
- [ ] 模式 B：选技能 → 调条件 → 核对四层拆解与威力链路
- [ ] FULL：双方各配 4 技能 → 核对每行伤害/血量比 → 点 `?` 看明细
- [ ] 特性：切攻/防方特性 → 确认输入框显隐正确、条件框可配、结果同步
- [ ] 该 Phase 已 commit，出问题可 `git revert` 单点回滚
