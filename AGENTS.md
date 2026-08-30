# AGENTS.md

## 项目概述

洛克王国 PVP 伤害计算器 —— 纯前端静态网页工具，**无构建系统、无 package.json、无依赖、无测试/lint**。数据来源：[BWiki 精灵图鉴](https://wiki.biligame.com/rocom/)。

## 运行与验证

- 直接用浏览器打开 `index.html` 即可。数据以 `<script src>` 全局常量形式加载，不发网络请求
- 如需本地服务器：`python -m http.server 8080`。
- 验证改动：打开页面 → 选攻击/防御精灵 → 调参数 → 查看计算结果，手动确认结果与 UI 均正常。

## 结构与架构边界

- `index.html` — 巨型单文件（约 185KB / 约 3370 行）：全部 UI 标记 + 全部计算逻辑都在行内 `<script>`（位于 body 末尾、数据脚本之后），入口为文件底部 `DOMContentLoaded`。
- `css/head.css` — 唯一样式表（主题变量、卡片、布局）。
- `data/*.js` — 游戏数据，均为全局常量，在 body 末尾、行内脚本之前按序加载：
  - `spirits.js` → `const SPIRITS`：精灵。字段：`no`(3位补零编号) `n`(名称) `hp/pa/ma/pd/md/sp`(六项种族值) `a1/a2`(主/副属性) `tr`(特性) `tr_desc`(特性描述) `st`(进化阶段) `img`(wiki 图片 URL)。
  - `skills.js` → `const SKILLS`：技能。字段：`n`(名称) `a`(属性) `p`(威力) `k`(物攻/魔攻/状态) `c`(能耗)。另有派生数组 `SORTED_SPIRITS`。
  - `type.js` → `const TYPE_CHART`：属性克制表（strong/weak/resist/vulnerable/immune）。
  - `pinyin.js` → `const PINYIN_MAP`：拼音搜索映射。
- `design.md` — 视觉与交互设计规范。**改 UI 前先读它**。
- `analytics.js` — 百度统计，勿动。

## 核心计算逻辑（均在 index.html 行内脚本中）

- `calc()` — 主伤害计算（模式 A/B）；`calcFull()` / `calcOneFskDmg()` — FULL 配招模式。
- 三种模式：A（快捷）/ B（参数）/ FULL（配招），`switchMode()` 切换，互斥显示。
- 特性倍率：`calcAtkTraitMult` / `calcDefTraitMult` / `getTraitNeedsInput`（部分特性需要用户输入条件，见 `renderTraitCond`）。
- 属性克制：`getTypeEff`（含免疫判定）。
- 变动威力技能：闪击/鸣沙陷阱按速度差/物防差查表 `SPEED_DIFF_TABLE`（鸣沙复用同表），魔能爆按能量查表 `MANA_BURST_TABLE`；分档数据已按游戏内权威表核对（2026-08）。
- 收藏夹与主题均用 `localStorage` 持久化（`loadFavorites`/`saveFavorites` 等）。

## 更新游戏数据（常见任务）

- **不要凭记忆手写精灵/技能数值** —— 使用 `.codebuddy/skills/` 下的 AI 技能：
  - `sync-spirits`：按编号范围批量从 wiki 同步（配套 `.codebuddy/skills/sync-spirits/scripts/extract_spirits.py`，需 beautifulsoup4）。
  - `fetch-spirit-from-url`：从单个 wiki 详情页抓取一只精灵。
  - `update-spirit-stats` / `add-spirit-skill`：更新资质 / 添加技能。
- 向 `SPIRITS` 数组追加时：插在最后一个 `}` 之后、`]` 之前；用 `no`+`n` 组合去重；4 空格缩进。

## 约定与已知坑

- 所有用户可见文案为**简体中文**；文件编码 UTF-8（部分 CRLF 行尾）。终端输出中文出现乱码通常是显示端解码问题，文件本身有效，**不要"修复"编码**。
- UI 遵循"攻橙防蓝"语义：攻击方暖色、防御方冷色，始终成对出现（详见 design.md）；默认深色主题，可切换。
- `data/*.js` 不能移回 `<head>` 或加 `defer`：行内脚本在解析期立即执行并依赖这些全局常量，执行顺序颠倒会直接 ReferenceError 崩掉整个脚本。
- FULL 模式下 `calcFull()` 在攻防双方未选齐时提前返回，两侧技能面板标题保持「未选择精灵」——这是现有约定，不是 bug。
- `index.html` 体量大，编辑时用精确锚点定位替换，避免整文件重写。
