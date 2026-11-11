// ============================================================
// data/traitMult.js — 特性伤害规则数据层（纯数据 + 纯函数，**不碰 DOM**）
//   依赖：无（不引用 js/*.js 的任何绑定；需要面板值/查表函数时由调用方经 ctx 注入）
//   消费方：js/03-trait.js（计算 + 特性面板 UI）、js/04-power.js（威力修正栏）、
//           js/06-calc-ab.js / js/07-full.js（readTraitInputs 的通道判定）
//   加载顺序：spirits → skills → type → **traitMult** → skillMult → pinyin → spiritsPvP
//
// ── 文件结构（自上而下）────────────────────────────────────
//   ① ATK_TRAIT_RULES / DEF_TRAIT_RULES 两张规则表 + 注册函数
//        defineAtkTraitRule / defineDefTraitRule / defineBothTraitRule
//      ⚠️ 两张表的 const 声明与三个注册函数必须排在所有规则定义之前（否则 TDZ 报错）
//   ② 规则条目（按通道分组：能耗 / 属性判定 / 层数 / 攻防属性 stat / 减伤 f …）
//   ③ TRAIT_LEVEL_RULES 等级类特性（defineTraitLevelRule，当前 3 条：恶龙的奢望 / 圣龙的心愿 / 圣龙的守护）
//   ④ TRAIT_CHANNELS 静态通道声明表 + 查询 helper（决定 UI 显示哪些输入框；
//      支持普通通道与 { sides: { atk, def } } 按侧声明）
//   ⑤ SPIRIT_TRAIT_ALIAS 精灵名 → 查表特性名 + resolveTraitName()
//      首领/特殊形态沿用基础形态的规则，不改 spirits.js 的 tr
//   规模（2026-11）：规则 攻 78 / 防 31（并集 90 个特性名），通道表 90 条
//
// ── 新增一条特性规则的最小步骤 ─────────────────────────────
//   ① 本文件注册（fields + eff），并按「侧向归属」选对注册函数
//   ② TRAIT_CHANNELS 登记通道（攻/防侧不同时用 { sides: { atk, def } }），
//      否则 UI 退化为只显示「特性倍率」
//   ③ node .tmp/verify_new_traits.js / verify_formula.js / smoke_load.js
//   ⚠️ 条件字段构造器只能用本文件的 ck（复选框）/ num（数字框）；
//      skillMult.js 另有 spCk / spNum，两套同名会整页白屏
//
// ── 规则对象 ───────────────────────────────────────────────
//   fields(skill) → 条件字段数组，渲染成复选框 / 数字框
//   eff(ctx)      → { f, d, stat, powerBonus, powerMult, powerPct }；条件不满足时返回 null
//   ctx（攻方由 calcAtkTraitMult 构造，防方由 calcDefTraitMult 构造，字段同名同义）：
//     { skAttr, skCost, skKind, skName, atkA1, atkA2, defA1, defA2, def, typeEff, level, opts }
//     ⚠️ 防方侧的 skill 是**攻方那一击**的技能，不要用它判断「自己要出什么」
//
// ── 通道与层 ───────────────────────────────────────────────
//   f          结算层：伤害总倍率；f < 1 即减伤。只留给「整体乘算 / 减伤」类
//   stat       攻击层 / 防御层：直接改持有者自身的攻防（2026 新增，向后兼容）
//                { patk:{pct,flat}, matk:…, pdef:…, mdef:…, spd:… }
//                pct = 0.2 表示 +20%；flat 为固定点数，直接加在面板值上
//                不设 target 字段：只表达「自己」的攻防变化，不跨方联动
//                （公式只依赖「攻方攻击力 + 防方防御力」，防方特性不改攻方攻击力）
//   powerBonus 威力层固定威力提升区：加算（与技能威力加成求和）
//   powerMult  威力层技能威力乘区：以「倍率 − 1」的增量并入
//   powerPct   同上，实现上折算进 powerMult（×(1+pct)）
//   叠加口径：固定点数跨来源相加；百分比跨来源**也**相加（同特性内部按描述线性展开层数），
//             全程不连乘 —— 2 个 +20% = +40%，不是 ×1.44
//   侧向生效：物攻技能只吃 patk / pdef，魔攻技能只吃 matk / mdef
//             （由 js/02-damage.js 的 collectStatBuffs 按角色取键，不是本文件过滤）
//
// ── 威力公式（唯一实现在 js/02-damage.js 的 computeDamage）──────
//     威力 = (基础威力区 + 固定威力提升区) × 技能威力乘区
//     基础威力区     = 技能威力 × 应对倍率（应对成功威力×N / 威力翻倍 这类描述）
//     固定威力提升区 = 技能威力加成 + 特性威力加成（powerBonus，求和）
//     技能威力乘区   = 1 + Σ(技能威力+N% 与 特性威力倍率 的增量，跨来源相加)
//   ⚠️ 1) 应对倍率只放大基础威力，**不放大**固定威力提升区；
//      2) 特性威力倍率（含 powerPct 折算）不单独乘整段，而是按「倍率 − 1」并入乘区求和
//
// ── 侧向归属（放错表会「一半生效、一半丢失」）──────────────
//   攻方 → ATK_TRAIT_RULES：采纳 f / stat / powerBonus / powerMult / powerPct
//   防方 → DEF_TRAIT_RULES：只采纳 f 与 stat（防方不参与威力层）
//   因此：
//     · 自身增益类（stat，且条件与「自己本次出什么技能」无关：层数 / 次数 / 周末）
//       → defineBothTraitRule 双侧登记；只登记攻方表时该精灵当防方会整段丢失
//     · 纯防御类（只改物防 / 魔防）→ 只登记防方表；登记到攻方表会让物防出现在
//       「攻击层」被当成攻击加成（历史「宇宙之眼」即因此被错误计入伤害）
//     · 条件引用 skAttr / skCost / skKind（自己本次出招）→ 只能登记攻方表：
//       防方侧传入的 skill 是攻方那一击的技能，条件会反
//       要覆盖防方场景，就把条件改成用户填写的次数 / 项数再双侧登记
//       （鼓气、三鼓作气、合拍、渗透就是这么处理的）
//     · 反应类减伤（偏振 / 绝对秩序，f ≠ 1）→ 只能登记防方表：
//       攻方表里的 f 会直接乘在出场伤害上
//
// ── UI 输入框显隐：TRAIT_CHANNELS ──────────────────────────
//   依据「规则声明了哪些通道」，而非「条件当前是否满足」
//     （例：蒸汽膨胀声明 powerBonus，层数为 0 时仍显示「特性威力」，不退化）
//   未登记 → 只显示「特性倍率」；查询走 getTraitChannelsForSide(name, side)
//   通道可并列（mult + atkM 会同时显示两个框）；攻/防侧落在不同层时用按侧声明
//
// ── f 通道迁移记录（避免重复计算 / 归位到正确的层）──────────
//   下列特性原先用 f 表达，已按语义归位，迁移后 f 一律为 1：
//     → stat（改攻防属性）：专注力、全神贯注、壮胆、得寸进尺、鼓气、三鼓作气、渗透、
//                           最好的伙伴、助燃、爆燃、蓄电池、超级电池、悲悯、悼亡、
//                           虫群鼓舞、虫群突袭、指挥家、恶魔的晚宴、变形活画(速度项)
//     → powerMult（改威力）：挺起胸脯/“国王”的威严、勇敢、顺风、破空、目空/夺目、涂鸦、
//                           圣火骑士、不移、水翼飞升、天通地明、观星、坠星、冰钻、身经百练、
//                           月光审判、绒粉星光
//   f 只保留给真正的「伤害总乘算 / 减伤」类规则（如偏振、绝对秩序）
//
// ── 其它约定 ───────────────────────────────────────────────
//   · 本文件使用真实中文字符（非 \uXXXX 转义），编码 UTF-8
//   · 特性名 / 描述 / 输入标签为从原始 switch 与 getTraitNeedsInput 原样转译的文案
//     （含个别历史笔误），保持与重构前行为、UI 一致
// ============================================================

const ATK_TRAIT_RULES = {};

function defineAtkTraitRule(names, fieldsFn, effFn) {
  const rule = { fields: fieldsFn, eff: effFn };
  names.forEach(n => { ATK_TRAIT_RULES[n] = rule; });
}

// 防方表与登记函数必须放在**任何规则定义之前**：
//   const 是要初始化的，defineBothTraitRule 在文件前半段就会被调用（鼓气/合拍…），
//   若 DEF_TRAIT_RULES 声明在后面，会直接抛 TDZ 错误把整个脚本打断。
const DEF_TRAIT_RULES = {};

function defineDefTraitRule(names, fieldsFn, effFn) {
  const rule = { fields: fieldsFn, eff: effFn };
  names.forEach(n => { DEF_TRAIT_RULES[n] = rule; });
}

// 双侧登记：自身增益（stat）且条件只依赖用户输入的特性，攻方/防方持有都要生效。
//   ⚠️ 条件里必须**不能**引用「自己当前使用的技能」（skCost / skKind / skAttr）——
//      防方侧传入的 skill 是攻方那一击的技能，语义会反。
function defineBothTraitRule(names, fieldsFn, effFn) {
  defineAtkTraitRule(names, fieldsFn, effFn);
  defineDefTraitRule(names, fieldsFn, effFn);
}

// 输入字段构造器：字段 id/type/def/min/max/step 与 js/03 renderTraitCond / readTraitOptsByMode 一致
const ck = (key, label, def) => ({ id: 'trait-opt-' + key, label, type: 'checkbox', key, def });
const num = (key, label, def, min, max, step) => ({ id: 'trait-opt-' + key, label, type: 'number', key, def, min, max, step });

// ------------------------------------------------------------
// 能耗类（无需用户输入）—— 均为「威力×N」→ powerMult 通道
// ------------------------------------------------------------
defineAtkTraitRule(['挺起胸脯', '“国王”的威严'], () => [],
  ctx => ctx.skCost === 1 ? { f: 1, powerMult: 1.5, d: '能耗1→威力×1.5' } : null);

defineAtkTraitRule(['勇敢'], () => [],
  ctx => ctx.skCost > 3 ? { f: 1, powerMult: 1.4, d: '能耗>3→威力×1.4' } : null);

// ------------------------------------------------------------
// 出手先后类（需勾选：是否先手）
// ------------------------------------------------------------
defineAtkTraitRule(['顺风'], () => [ck('faster', '先手攻击（攻方速度更高）', false)],
  ctx => ctx.opts.faster ? { f: 1, powerMult: 1.5, d: '先手→威力×1.5' } : null);

defineAtkTraitRule(['破空'], () => [ck('faster', '先手攻击（攻方速度更高）', false)],
  ctx => ctx.opts.faster ? { f: 1, powerMult: 1.75, d: '先手→威力×1.75' } : null);

// ------------------------------------------------------------
// 技能/自身属性判定类
// ------------------------------------------------------------
defineAtkTraitRule(['目空', '夺目'], () => [],
  ctx => ctx.skAttr && ctx.skAttr !== '光' ? { f: 1, powerMult: 1.25, d: '非光系→威力×1.25' } : null);

defineAtkTraitRule(['涂鸦'], () => [],
  ctx => ctx.skAttr && ctx.skAttr !== ctx.atkA1 && ctx.skAttr !== ctx.atkA2
    ? { f: 1, powerMult: 1.5, d: '非本系→威力×1.5' } : null);

// ------------------------------------------------------------
// “激活”开关类（需勾选）
// ------------------------------------------------------------
defineAtkTraitRule(['圣火骑士'], () => [ck('activated', '条件已触发', false)],
  ctx => ctx.opts.activated ? { f: 1, powerMult: 2.0, d: '应对成功后→威力×2.0' } : null);

// 专注力：入场首回合物攻+100% → 走 stat 通道（f 必须为 1，否则会与 stat 双重叠加）
defineAtkTraitRule(['专注力'], () => [ck('activated', '特性激活（首回合）', true)],
  ctx => ctx.opts.activated
    ? { f: 1, d: '入场首回合→物攻+100%', stat: { patk: { pct: 1.0 } } }
    : null);

defineAtkTraitRule(['不移'], () => [ck('activated', '本次技能无额外效果', true)],
  ctx => ctx.opts.activated !== false ? { f: 1, powerMult: 1.3, d: '无额外效果→威力×1.3' } : null);

defineAtkTraitRule(['水翼飞升'], () => [ck('activated', '本次技能能耗为0', true)],
  ctx => ctx.opts.activated !== false ? { f: 1, powerMult: 1.3, d: '能耗0→威力×1.3' } : null);
  
// 壮胆：队伍存在虫系精灵 → 双攻+50%（stat 通道，f=1）
defineAtkTraitRule(['壮胆'], () => [ck('activated', '队伍存在虫系精灵', true)],
  ctx => ctx.opts.activated
    ? { f: 1, d: '队伍有虫系→双攻+50%', stat: { patk: { pct: 0.5 }, matk: { pct: 0.5 } } }
    : null);

// 得寸进尺：雨天 或 处于其他水系环境 → 双攻+100%（stat 通道，f=1）
defineAtkTraitRule(['得寸进尺'],
  () => [ck('rainy', '天气为雨天', false), ck('waterEnv', '处于其他水系环境', false)],
  ctx => {
    if (!ctx.opts.rainy && !ctx.opts.waterEnv) return null;
    return {
      f: 1,
      d: (ctx.opts.rainy ? '雨天' : '水系环境') + '→双攻+100%',
      stat: { patk: { pct: 1.0 }, matk: { pct: 1.0 } },
    };
  });

defineAtkTraitRule(['天通地明'], () => [ck('enemyIsPolluted', '敌方是污染血脉', false)],
  ctx => ctx.opts.enemyIsPolluted ? { f: 1, powerMult: 2.0, d: '敌污染血脉→威力×2.0' } : null);

// ------------------------------------------------------------
// 叠加类（需填写）
// ------------------------------------------------------------
// 最好的伙伴 / 裁决 / 滋养 / 点燃 / 净化：造成克制伤害后，获得攻防速+20%
//   → stat 通道（按克制触发次数线性叠层）；4 只迪莫首领形态与「最好的伙伴」效果相同，共用本规则。
//   「首个技能替换为X系愿力冲击」属技能槽改造，未实现。
//   自身增益且条件只依赖用户填写的层数 → 双侧登记，持有者站防方时双防加成同样生效。
defineBothTraitRule(['最好的伙伴', '裁决', '滋养', '点燃', '净化'],
  () => [num('stackCount', '克制触发次数', 0, 0, 999)],
  ctx => {
    const n = ctx.opts.stackCount || 0;
    if (n <= 0) return null;
    const p = 0.2 * n;
    return {
      f: 1, d: '克制触发' + n + '次→攻防速+' + (p * 100).toFixed(0) + '%',
      stat: { patk: { pct: p }, matk: { pct: p }, pdef: { pct: p }, mdef: { pct: p }, spd: { pct: p } },
    };
  });

// 助燃：己方每用1次火系技能，双攻+20%（按次数线性展开）→ stat 通道
defineAtkTraitRule(['助燃'],
  () => [num('stackCount', '己方已使用火系技能次数', 0, 0, 999)],
  ctx => {
    const n = ctx.opts.stackCount || 0;
    if (n <= 0) return null;
    const p = 0.2 * n;
    return {
      f: 1, d: '火系技能' + n + '次→双攻+' + (p * 100).toFixed(0) + '%',
      stat: { patk: { pct: p }, matk: { pct: p } },
    };
  });

// 爆燃：己方每用1次火系技能，双攻永久+30%（按次数线性展开）→ stat 通道
defineAtkTraitRule(['爆燃'],
  () => [num('stackCount', '己方已使用火系技能次数', 0, 0, 999)],
  ctx => {
    const n = ctx.opts.stackCount || 0;
    if (n <= 0) return null;
    const p = 0.3 * n;
    return {
      f: 1, d: '火系技能' + n + '次→双攻永久+' + (p * 100).toFixed(0) + '%',
      stat: { patk: { pct: p }, matk: { pct: p } },
    };
  });

// 鼓气：使用能耗为3的技能时，双攻和双防+20%（按累积次数线性展开，走 stat 通道）
// 注：原文为「单次触发 +20%」，此处按已触发次数 n 展开为 +20%×n，与迁移前数值一致
// 触发次数由用户填写 → 与「自己出招」无关 → 双侧登记（当防方时只吃双防分量）
defineBothTraitRule(['鼓气'],
  () => [num('stackCount', '已累积触发次数', 0, 0, 999)],
  ctx => {
    const n = ctx.opts.stackCount || 0;
    if (n <= 0) return null;
    const p = 0.2 * n;
    return {
      f: 1, d: '能耗3技能' + n + '次→双攻双防+' + (p * 100).toFixed(0) + '%',
      stat: { patk: { pct: p }, matk: { pct: p }, pdef: { pct: p }, mdef: { pct: p } },
    };
  });

// ------------------------------------------------------------
// 观星 / 坠星：敌印记层数叠加（需输入层数）—— 「威力×N」→ powerMult
// ------------------------------------------------------------
defineAtkTraitRule(['观星'], () => [num('stackCount', '敌方星陨印记层数(0-20)', 0, 0, 20)],
  ctx => {
    if (ctx.skAttr === '地' && (ctx.opts.stackCount || 0) > 0) {
      const m = 1 + 0.15 * ctx.opts.stackCount;
      return { f: 1, powerMult: m, d: '观星' + ctx.opts.stackCount + '层→威力×' + m.toFixed(2) };
    }
    return null;
  });

defineAtkTraitRule(['坠星'], () => [num('stackCount', '敌方星陨印记层数(0-20)', 0, 0, 20)],
  ctx => {
    if ((ctx.opts.stackCount || 0) > 0) {
      const m = 1 + 0.15 * ctx.opts.stackCount;
      return { f: 1, powerMult: m, d: '坠星' + ctx.opts.stackCount + '层→威力×' + m.toFixed(2) };
    }
    return null;
  });

// ------------------------------------------------------------
// 蓄电池 / 超级电池：入场次数叠加 —— 「双攻+N%」→ stat 通道
// ------------------------------------------------------------
defineAtkTraitRule(['蓄电池'], () => [num('stackCount', '已入场次数(0-5)', 0, 0, 5)],
  ctx => {
    const n = ctx.opts.stackCount || 0;
    if (n <= 0) return null;
    const p = 0.2 * n;
    return {
      f: 1, d: '蓄电池入场' + n + '次→双攻+' + (p * 100).toFixed(0) + '%',
      stat: { patk: { pct: p }, matk: { pct: p } },
    };
  });

defineAtkTraitRule(['超级电池'], () => [num('stackCount', '已入场次数(0-5)', 0, 0, 5)],
  ctx => {
    const n = ctx.opts.stackCount || 0;
    if (n <= 0) return null;
    const p = 0.3 * n;
    return {
      f: 1, d: '超级电池入场' + n + '次→双攻永久+' + (p * 100).toFixed(0) + '%',
      stat: { patk: { pct: p }, matk: { pct: p } },
    };
  });

// ------------------------------------------------------------
// 冰钻 / 变形活画：敌方能量、增益（特殊 key）
// ------------------------------------------------------------
// 冰钻：「威力×(1+0.1×敌总能耗)」→ powerMult 通道
defineAtkTraitRule(['冰钻'], () => [num('enemyTotalCost', '敌方携带技能总能耗', 0, 0, 20)],
  ctx => {
    if ((ctx.opts.enemyTotalCost || 0) > 0) {
      const m = 1 + 0.1 * ctx.opts.enemyTotalCost;
      return { f: 1, powerMult: m, d: '冰钻(敌总能耗' + ctx.opts.enemyTotalCost + ')→威力×' + m.toFixed(2) };
    }
    return null;
  });

// 变形活画：行动时，敌方每有1层增益，本次行动技能威力+10%，速度+5
//   → 威力百分比走 powerPct 通道（并入特性威力倍率），速度走 stat.spd.flat
//   迁移前为 f = 1+0.1n（无条件放大全部伤害），现改为正确的威力百分比
defineAtkTraitRule(['变形活画'], () => [num('enemyBuff', '敌方当前增益层数', 0, 0, 20)],
  ctx => {
    const n = ctx.opts.enemyBuff || 0;
    if (n > 0) {
      return {
        f: 1,
        d: '敌' + n + '层增益→本次威力+' + (n * 10) + '%、速度+' + (n * 5),
        powerPct: 0.1 * n,
        stat: { spd: { flat: 5 * n } },
      };
    }
    return null;
  });

// ------------------------------------------------------------
// 悲悯 / 悼亡：力竭精灵数叠加 —— 「双攻+N%」→ stat 通道
// ------------------------------------------------------------
defineAtkTraitRule(['悲悯'], () => [num('stackCount', '己方力竭精灵数量(0-10)', 0, 0, 10)],
  ctx => {
    const n = ctx.opts.stackCount || 0;
    if (n <= 0) return null;
    const p = 0.3 * n;
    return {
      f: 1, d: n + '只力竭→双攻+' + (p * 100).toFixed(0) + '%',
      stat: { patk: { pct: p }, matk: { pct: p } },
    };
  });

defineAtkTraitRule(['悼亡'], () => [num('stackCount', '双方力竭精灵数量(0-10)', 0, 0, 10)],
  ctx => {
    const n = ctx.opts.stackCount || 0;
    if (n <= 0) return null;
    const p = 0.3 * n;
    return {
      f: 1, d: n + '只力竭→双攻+' + (p * 100).toFixed(0) + '%',
      stat: { patk: { pct: p }, matk: { pct: p } },
    };
  });

// ------------------------------------------------------------
// 虫群鼓舞 / 虫群突袭：己方其他虫系精灵数叠加 —— 「攻防速+N%」→ stat 通道
// ------------------------------------------------------------
defineAtkTraitRule(['虫群鼓舞'], () => [num('stackCount', '队伍中其他虫系精灵数(0-5)', 0, 0, 5)],
  ctx => {
    const n = ctx.opts.stackCount || 0;
    if (n <= 0) return null;
    const p = 0.1 * n;
    return {
      f: 1, d: n + '只虫系→入场攻防速+' + (p * 100).toFixed(0) + '%',
      stat: { patk: { pct: p }, matk: { pct: p }, pdef: { pct: p }, mdef: { pct: p }, spd: { pct: p } },
    };
  });

defineAtkTraitRule(['虫群突袭'], () => [num('stackCount', '队伍中其他虫系精灵数(0-5)', 0, 0, 5)],
  ctx => {
    const n = ctx.opts.stackCount || 0;
    if (n <= 0) return null;
    const p = 0.15 * n;
    return {
      f: 1, d: n + '只虫系→入场攻防速+' + (p * 100).toFixed(0) + '%',
      stat: { patk: { pct: p }, matk: { pct: p }, pdef: { pct: p }, mdef: { pct: p }, spd: { pct: p } },
    };
  });

// ------------------------------------------------------------
// 指挥家 / 三鼓作气 / 身经百练：累积次数叠加
// ------------------------------------------------------------
// 指挥家：应对成功后双攻+N% → stat 通道
defineAtkTraitRule(['指挥家'], () => [num('stackCount', '已累积触发次数', 0, 0, 10)],
  ctx => {
    const n = ctx.opts.stackCount || 0;
    if (n <= 0) return null;
    const p = 0.2 * n;
    return {
      f: 1, d: '应对' + n + '次→双攻+' + (p * 100).toFixed(0) + '%',
      stat: { patk: { pct: p }, matk: { pct: p } },
    };
  });

// 三鼓作气：使用能耗为3的技能后，双攻和双防永久+20%（按累积次数展开，走 stat 通道）
// 触发次数由用户填写 → 双侧登记
defineBothTraitRule(['三鼓作气'], () => [num('stackCount', '已累积触发次数', 0, 0, 10)],
  ctx => {
    const n = ctx.opts.stackCount || 0;
    if (n <= 0) return null;
    const p = 0.2 * n;
    return {
      f: 1, d: '三鼓' + n + '次→双攻双防永久+' + (p * 100).toFixed(0) + '%',
      stat: { patk: { pct: p }, matk: { pct: p }, pdef: { pct: p }, mdef: { pct: p } },
    };
  });

// 身经百练：水/武系技能威力×(1+0.2n) → powerMult 通道
defineAtkTraitRule(['身经百练'],
  skill => ((skill && (skill.a === '水' || skill.a === '武')) ? [num('stackCount', '己方应对成功次数', 0, 0, 10)] : []),
  ctx => {
    if ((ctx.opts.stackCount || 0) > 0 && (ctx.skAttr === '水' || ctx.skAttr === '武')) {
      const m = 1 + 0.2 * ctx.opts.stackCount;
      return { f: 1, powerMult: m, d: '应对' + ctx.opts.stackCount + '次→水/武威力×' + m.toFixed(2) };
    }
    return null;
  });

// ------------------------------------------------------------
// 恶魔的晚宴：本场击败数叠加 —— 「双攻+N%」→ stat 通道
// ------------------------------------------------------------
defineAtkTraitRule(['恶魔的晚宴'], () => [num('stackCount', '本场已击败敌方精灵数(0-5)', 0, 0, 5)],
  ctx => {
    const n = ctx.opts.stackCount || 0;
    if (n <= 0) return null;
    const p = 0.5 * n;
    return {
      f: 1, d: '击败' + n + '只→双攻永久+' + (p * 100).toFixed(0) + '%',
      stat: { patk: { pct: p }, matk: { pct: p } },
    };
  });

// ------------------------------------------------------------
// 全神贯注：激活开关 + 已行动次数
// ------------------------------------------------------------
// 全神贯注：入场时物攻+100%，每次行动后-20%（走 stat 通道，f=1）
// pct = (5-n)*0.2，与迁移前 f = 1+(5-n)*0.2 数值等价
defineAtkTraitRule(['全神贯注'],
  () => [ck('activated', '特性激活（首回合）', true), num('stackCount', '已行动次数(0-5)', 0, 0, 5)],
  ctx => {
    if (!ctx.opts.activated) return null;
    const n = Math.max(0, Math.min(5, ctx.opts.stackCount || 0));
    const p = Math.max(0, (5 - n) * 0.2);
    return {
      f: 1, d: '全神贯注(已行动' + n + '次)→物攻+' + (p * 100).toFixed(0) + '%',
      stat: { patk: { pct: p } },
    };
  });

// ------------------------------------------------------------
// 敌方血脉判定类（月光审判 / 绒粉星光，需用户勾选）
// ------------------------------------------------------------
// 月光审判 / 绒粉星光：「威力×2.0」→ powerMult 通道
defineAtkTraitRule(['月光审判'], () => [ck('enemyIsBoss', '敌方为首领血脉', false)],
  ctx => ctx.opts.enemyIsBoss ? { f: 1, powerMult: 2.0, d: '敌方首领血脉→威力×2.0' } : null);

defineAtkTraitRule(['绒粉星光'], () => [ck('enemyIsHeterotype', '敌方非本系血脉', false)],
  ctx => ctx.opts.enemyIsHeterotype ? { f: 1, powerMult: 2.0, d: '敌非本系血脉→威力×2.0' } : null);

// ------------------------------------------------------------
// 渗透 / 蒸汽膨胀：按己方已使用某类技能的累计次数叠加
//   - 渗透：己方每用1次武系或地系技能，入场时攻防+5%/层（按次数线性展开，走 stat 通道）
//     ⚠️ 双侧登记：改的是持有者自己的攻防，站防方时同样要吃到物防/魔防加成
//        （条件只依赖用户填写的次数，不引用「自己当前使用的技能」，符合文件头的双侧条件）
//   - 蒸汽膨胀：己方每用1次火系技能，入场时全技能威力+10/层（威力加法，
//     通过 eff 返回的 powerBonus 通道在伤害计算中真正加到威力基数）
// ------------------------------------------------------------
defineBothTraitRule(['渗透'],
  () => [num('stackCount', '己方已使用武系或地系技能次数', 0, 0, 999)],
  ctx => {
    const n = ctx.opts.stackCount || 0;
    if (n <= 0) return null;
    const p = 0.05 * n;
    return {
      f: 1, d: '武/地技能' + n + '次→攻防+' + (p * 100).toFixed(0) + '%',
      stat: { patk: { pct: p }, matk: { pct: p }, pdef: { pct: p }, mdef: { pct: p } },
    };
  });

defineAtkTraitRule(['蒸汽膨胀'],
  () => [num('stackCount', '己方已使用火系技能次数', 0, 0, 999)],
  ctx => {
    const n = ctx.opts.stackCount || 0;
    if (n <= 0) return null;
    const bonus = 10 * n;
    return { f: 1, d: '火系技能' + n + '次→全技能威力+' + bonus, powerBonus: bonus };
  });

// ============================================================
// 防方「特殊特性」规则表（减伤）
// 原 calcDefTraitMult 的 defTr 分支 + getDefTraitNeedsInput 整理于此
// ============================================================
// 说明：
//   - 与攻方规则表结构一致：一条规则 = 一个特性名（含需要输入的字段 + eff 减伤逻辑）。
//   - fields(skill)  返回该特性需要用户输入的字段（偏振/完全偏振因 label 嵌技能属性，用 skill 动态生成）。
//   - eff(ctx)       返回 { f: 减伤因子(≤1), d: 描述文案 }；条件不满足时返回 null。
//   - ctx 由 calcDefTraitMult 构造：
//       { skAttr, atkA1, atkA2, def, opts }
//   - 偏振/完全偏振依赖 index.html 的全局 checkDefCarriesAttr(def, skAttr) 自动检测；
//     自动检测不可用时回退到用户勾选 opts.defCarriesSameAttr（与原始逻辑一致）。
//   - 特性名 / 描述 / 输入标签均为原样转译，保留原始文案写法。
// ============================================================

// （DEF_TRAIT_RULES / defineDefTraitRule / defineBothTraitRule 声明见文件开头）

// 偏振 / 完全偏振输入字段构造：key=defCarriesSameAttr，带 onlyIfNoAuto，
// label 动态嵌入技能属性（如「防御方携带了火系技能」）
const defCarryCk = (label) => ({
  id: 'defCarriesSameAttr', label, type: 'checkbox', key: 'defCarriesSameAttr',
  def: true, onlyIfNoAuto: true
});

// 偏振 / 完全偏振共用的减伤判定（各自带不同倍率与文案）
function polarizedEff(factor, pct) {
  return ctx => {
    if (!ctx.def) return null;
    const autoCarry = checkDefCarriesAttr(ctx.def, ctx.skAttr);
    const defCarries = autoCarry !== null
      ? autoCarry
      : (ctx.opts.defCarriesSameAttr !== undefined ? ctx.opts.defCarriesSameAttr : false);
    if (!defCarries) return null;
    return { f: factor, d: '防御方携带' + ctx.skAttr + '系技能，受该系攻击-' + pct + '%→×' + factor };
  };
}

defineDefTraitRule(['偏振'],
  skill => [defCarryCk('防御方携带了' + (skill ? skill.a : '') + '系技能')],
  polarizedEff(0.6, 40));

defineDefTraitRule(['完全偏振'],
  skill => [defCarryCk('防御方携带了' + (skill ? skill.a : '') + '系技能')],
  polarizedEff(0.5, 50));

defineDefTraitRule(['绝对秩序'], () => [],
  ctx => {
    const isAtkNativeType = ctx.skAttr === ctx.atkA1 || (ctx.atkA2 && ctx.skAttr === ctx.atkA2);
    if (isAtkNativeType) return null;
    return { f: 0.5, d: '攻击方使用非本系技能，伤害-50%→×0.5' };
  });

// ============================================================
// 攻防属性加成规则（stat 通道）—— 一期新增
// ============================================================
// 用途：精灵特性直接提升/降低「物攻/魔攻/物防/魔防/速度」，
//       此前无法表达——旧模型只能把特性写成「伤害乘算」f，导致：
//         ① 「物攻+100%」会错误放大魔攻技能伤害（未做物理/魔法侧向限定）
//         ② 旧模型下多个来源只能连乘（现已改为跨来源相加，见下方「叠加口径」）
//
// stat 结构：{ patk:{pct,flat}, matk:{...}, pdef:{...}, mdef:{...}, spd:{...} }
//   pct  —— 该来源的百分比加成（小数，0.2 = +20%）
//   flat —— 固定点数加成（直接加在面板值上）
//
// 叠加口径（现行口径，与 AGENTS.md「特性攻防加成（stat 通道）」一致）：
//   · 固定点数跨来源相加
//   · 百分比跨来源也相加 → pctMult = 1 + Σpct（同特性内部按描述线性展开层数，不得写成幂）
//   · 合成后再与能力等级增量同处一个加成乘区（见 index.html computeDamage）
//
// 侧向生效：物攻技能只吃 patk / pdef；魔攻技能只吃 matk / mdef（由 index.html
//   的 computeDamage 过滤）。速度不进伤害分式，仅回写面板值供闪击查表与先手判定。
//
// 范围口径：只算「攻方攻击力 + 防方防御力」。仅影响攻击力、或只给敌方加减
//   攻击/防御的特性（毒牙、虚假宝箱）不实现——见方案 2.2。
// ============================================================

// 通用构造器：把一组 {pct, flat} 百分比/固定值打包成 stat 条目
const st = (o) => o;

// ------------------------------------------------------------
// 单项攻防（13 条）
// ------------------------------------------------------------

// 草木苏醒时：每回复1能量，物攻和魔攻永久+20%（攻击后重置）
defineAtkTraitRule(['草木苏醒时'],
  () => [num('energyGain', '本场累计回复能量数', 0, 0, 10)],
  ctx => {
    const n = Math.max(0, Math.min(10, ctx.opts.energyGain || 0));
    if (n === 0) return null;
    const p = 0.2 * n;
    return {
      f: 1, d: '回复' + n + '能量→物攻魔攻永久+' + (p * 100).toFixed(0) + '%',
      stat: st({ patk: { pct: p }, matk: { pct: p } }),
    };
  });

// 贪得无厌：每过量回复5%生命转化为10%物攻（50%吸血本身不进伤害公式）
defineAtkTraitRule(['贪得无厌'],
  () => [num('overheal', '过量回复生命格数(每5%=1格)', 0, 0, 10)],
  ctx => {
    const n = Math.max(0, Math.min(10, ctx.opts.overheal || 0));
    if (n === 0) return null;
    const p = 0.1 * n;
    return { f: 1, d: '过量回复' + n + '格→物攻+' + (p * 100).toFixed(0) + '%', stat: st({ patk: { pct: p } }) };
  });

// 合拍：与敌方技能每有1项相同，回合结束时物攻和物防永久+10%
// 相同项数由用户填写（系别/类型/能耗，单回合最多 3 项，但跨回合永久累积，故上限 99）→ 双侧登记
defineBothTraitRule(['合拍'],
  () => [num('sameCount', '累计相同项数(系别/类型/能耗)', 0, 0, 99)],
  ctx => {
    const n = Math.max(0, Math.min(99, ctx.opts.sameCount || 0));
    if (n === 0) return null;
    const p = 0.1 * n;
    return {
      f: 1, d: '与敌方技能相同' + n + '项→物攻物防永久+' + (p * 100).toFixed(0) + '%',
      stat: st({ patk: { pct: p }, pdef: { pct: p } }),
    };
  });

// 搜刮：敌方每使用1次「聚能」技能或更换精灵，入场时魔攻+20%
defineAtkTraitRule(['搜刮'],
  () => [num('stackCount', '敌方已用聚能技能/更换精灵次数', 0, 0, 10)],
  ctx => {
    const n = Math.max(0, ctx.opts.stackCount || 0);
    if (n === 0) return null;
    const p = 0.2 * n;
    return { f: 1, d: '敌方聚能/换精灵' + n + '次→入场魔攻+' + (p * 100).toFixed(0) + '%', stat: st({ matk: { pct: p } }) };
  });

// 和弦共振：双方场上每有1种不同的印记，自己获得魔攻+50%
defineAtkTraitRule(['和弦共振'],
  () => [num('markKinds', '双方场上不同印记种类数', 0, 0, 10)],
  ctx => {
    const n = Math.max(0, ctx.opts.markKinds || 0);
    if (n === 0) return null;
    return { f: 1, d: '场上' + n + '种印记→魔攻+' + (n * 50) + '%', stat: st({ matk: { pct: 0.5 * n } }) };
  });

// 猫精灵的礼物：己方每完整使用1次「选择」技能，入场时物攻+40%
defineAtkTraitRule(['猫精灵的礼物'],
  () => [num('stackCount', '已完整使用「选择」技能次数', 0, 0, 5)],
  ctx => {
    const n = Math.max(0, ctx.opts.stackCount || 0);
    if (n === 0) return null;
    return { f: 1, d: '完整使用「选择」' + n + '次→入场物攻+' + (n * 40) + '%', stat: st({ patk: { pct: 0.4 * n } }) };
  });

// 先知：若敌方技能足够击败自己，回合开始时速度+50，双攻+50%
//   速度为固定点数，不进伤害分式，需回写面板值供闪击查表与先手判定
defineAtkTraitRule(['先知'], () => [ck('fatal', '敌方技能足够击败自己', false)],
  ctx => ctx.opts.fatal
    ? {
      f: 1, d: '敌方技能致命→速度+50、双攻+50%',
      stat: st({ patk: { pct: 0.5 }, matk: { pct: 0.5 }, spd: { flat: 50 } }),
    }
    : null);

// ============================================================
// 攻防属性加成规则（stat 通道）—— 防方侧
// ============================================================
// 防方精灵的攻防加成走 DEF_TRAIT_RULES（同一 stat 通道，由 index.html 统一解析）。
//   ⚠️ 攻方表里的规则**不会**自动在防方生效：两侧查表互不相通，
//      只登记攻方表 = 该精灵当防方时这段增益整段丢失。
//      自身增益且条件与「自己出招」无关的，一律用 defineBothTraitRule 双侧登记。
//   ⚠️ 防方路径只采纳 f 与 stat（防方不参与威力层），
//      所以双侧登记的规则里 powerBonus / powerMult 只在攻方侧起作用，这是刻意的。
// ------------------------------------------------------------

// 保守派：敌方总能耗<4 时双防+80%（防方专属，敌方视角）
defineDefTraitRule(['保守派'], () => [],
  ctx => {
    const cost = (ctx.opts && typeof ctx.opts.foeTotalCost === 'number') ? ctx.opts.foeTotalCost : null;
    if (cost === null || cost >= 4) return null;
    return { f: 1, d: '敌方总能耗' + cost + '<4→双防+80%', stat: st({ pdef: { pct: 0.8 }, mdef: { pct: 0.8 } }) };
  });

// ── 纯防御类：只登记防方表 ──
//   它们只改自己的物防/魔防，攻方手里毫无作用；若登记到攻方表，
//   还会被 collectStatBuffs 当作「攻击层加成」乘进出场伤害（历史 bug：宇宙之眼）。

// 守护之心：双方场上每有1种不同的增益，自己获得物防+20%
defineDefTraitRule(['守护之心'],
  () => [num('buffKinds', '双方场上不同增益种类数', 0, 0, 10)],
  ctx => {
    const n = Math.max(0, ctx.opts.buffKinds || 0);
    if (n === 0) return null;
    return { f: 1, d: '场上' + n + '种增益→物防+' + (n * 20) + '%', stat: st({ pdef: { pct: 0.2 * n } }) };
  });

// 宇宙之眼：敌方每有1层星陨印记，自己获得物防+10%
//   与「观星/坠星」的 f 规则（威力通道）互不相同，此处只管自身物防
defineDefTraitRule(['宇宙之眼'],
  () => [num('stackCount', '敌方星陨印记层数', 0, 0, 20)],
  ctx => {
    const n = Math.max(0, ctx.opts.stackCount || 0);
    if (n === 0) return null;
    return { f: 1, d: '敌方' + n + '层星陨印记→物防+' + (n * 10) + '%', stat: st({ pdef: { pct: 0.1 * n } }) };
  });

// ── 攻防双分支：双侧登记（攻方侧有攻击分量，防方侧有防御分量）──

// 扫荡：敌方每使用1次「聚能」或更换精灵，入场时魔攻+20% 和 魔防+10%
defineBothTraitRule(['扫荡'],
  () => [num('stackCount', '敌方已用聚能技能/更换精灵次数', 0, 0, 10)],
  ctx => {
    const n = Math.max(0, ctx.opts.stackCount || 0);
    if (n === 0) return null;
    return {
      f: 1,
      d: '敌方聚能/换精灵' + n + '次→入场魔攻+' + (n * 20) + '%、魔防+' + (n * 10) + '%',
      stat: st({ matk: { pct: 0.2 * n }, mdef: { pct: 0.1 * n } }),
    };
  });

// 蒸汽革命：己方每使用1次火系技能，入场时全技能威力+10 和 物防+5%
//   威力加算走既有 powerBonus 通道（仅攻方侧生效）；物防走 stat（双侧）
defineBothTraitRule(['蒸汽革命'],
  () => [num('stackCount', '己方已使用火系技能次数', 0, 0, 10)],
  ctx => {
    const n = Math.max(0, Math.min(10, ctx.opts.stackCount || 0));
    if (n === 0) return null;
    return {
      f: 1,
      d: '火系技能' + n + '次→入场全技能威力+' + (n * 10) + '、物防+' + (n * 5) + '%',
      powerBonus: 10 * n,
      stat: st({ pdef: { pct: 0.05 * n } }),
    };
  });

// 张弛有度：周末双攻+40%，其他时间双防+40%（互斥条件）
//   周末分支只对「当攻方」有意义，平日分支只对「当防方」有意义，
//   另一侧由 collectStatBuffs 的对位取键自动丢弃
defineBothTraitRule(['张弛有度'], () => [ck('weekend', '当前为周末（取消勾选=平日）', true)],
  ctx => ctx.opts.weekend
    ? { f: 1, d: '周末→双攻+40%', stat: st({ patk: { pct: 0.4 }, matk: { pct: 0.4 } }) }
    : { f: 1, d: '平日→双防+40%', stat: st({ pdef: { pct: 0.4 }, mdef: { pct: 0.4 } }) });

// ============================================================
// 批次新增（2026-10）—— 威力类 14 条（通道 pwA / pwM）
// ============================================================
// 说明：
//   · 这些都是「持有者自己出手时威力变化」，因此只登记攻方表 ——
//     防方路径不参与威力层（calcDefTraitMult 只采纳 f 与 stat）。
//   · 条件里引用「本次技能」（skKind / skAttr / skName）是安全的：
//     攻方路径传入的 skill 就是持有者自己正在使用的技能。
//   · 未实现：换碟（描述未给出具体提升数值）。
// ------------------------------------------------------------

// 电流刺激：携带的攻击技能获得迸发：威力+40（4 只）
//   迸发是「本次技能」的触发式效果（同族文案见 skills.js：「电弧 … 迸发：本次技能威力+40」），
//   是否触发由用户勾选，默认未触发 —— 与「圣火骑士」的 activated 开关同构。
defineAtkTraitRule(['电流刺激'], () => [ck('activated', '本次技能迸发已触发', false)],
  ctx => (ctx.opts.activated && ctx.skKind !== '状态')
    ? { f: 1, powerBonus: 40, d: '迸发触发→攻击技能威力+40' }
    : null);

// 共鸣 / 齐鸣：「虫鸣」威力+20（齐鸣另含「己方虫系技能巧变：虫鸣」，属技能改造，未实现）
defineAtkTraitRule(['共鸣', '齐鸣'], () => [],
  ctx => ctx.skName === '虫鸣' ? { f: 1, powerBonus: 20, d: '「虫鸣」威力+20' } : null);

// 冻土：每携带1个冰系技能进入战斗，地系技能威力+10%
defineAtkTraitRule(['冻土'],
  () => [num('iceSkills', '携带的冰系技能数', 0, 0, 4)],
  ctx => {
    const n = Math.max(0, ctx.opts.iceSkills || 0);
    if (n === 0 || ctx.skAttr !== '地') return null;
    return { f: 1, powerMult: 1 + 0.1 * n, d: '携带' + n + '个冰系技能→地系技能威力+' + (n * 10) + '%' };
  });

// 拨浪鼓：己方精灵每使用1次状态技能，自己入场时毒系和萌系技能威力+10
defineAtkTraitRule(['拨浪鼓'],
  () => [num('statusUses', '己方已使用状态技能次数', 0, 0, 10)],
  ctx => {
    const n = Math.max(0, ctx.opts.statusUses || 0);
    if (n === 0 || ['毒', '萌'].indexOf(ctx.skAttr) < 0) return null;
    return { f: 1, powerBonus: 10 * n, d: '状态技能' + n + '次→' + ctx.skAttr + '系技能威力+' + (n * 10) };
  });

// 定向精炼：己方精灵每使用1次防御技能，自己入场时机械系和地系技能威力+10%
defineAtkTraitRule(['定向精炼'],
  () => [num('defSkillUses', '己方已使用防御技能次数', 0, 0, 10)],
  ctx => {
    const n = Math.max(0, ctx.opts.defSkillUses || 0);
    if (n === 0 || ['机械', '地'].indexOf(ctx.skAttr) < 0) return null;
    return { f: 1, powerMult: 1 + 0.1 * n, d: '防御技能' + n + '次→' + ctx.skAttr + '系技能威力+' + (n * 10) + '%' };
  });

// 向心力：1号和2号位技能获得传动1和威力+30（传动未实现）
defineAtkTraitRule(['向心力'],
  () => [ck('slot12', '本次技能在1号或2号位', false)],
  ctx => ctx.opts.slot12
    ? { f: 1, powerBonus: 30, d: '1/2号位技能→威力+30' }
    : null);

// 斗技：应对成功后，获得全技能威力永久+30（按累积次数展开）
defineAtkTraitRule(['斗技'],
  () => [num('successUses', '应对成功次数', 0, 0, 10)],
  ctx => {
    const n = Math.max(0, ctx.opts.successUses || 0);
    if (n === 0) return null;
    return { f: 1, powerBonus: 30 * n, d: '应对成功' + n + '次→全技能威力+' + (n * 30) };
  });

// 血型吸引：敌方每携带1种系别的技能，自己攻击时威力+10
defineAtkTraitRule(['血型吸引'],
  () => [num('foeAttrKinds', '敌方携带的系别数', 0, 0, 18)],
  ctx => {
    const n = Math.max(0, ctx.opts.foeAttrKinds || 0);
    if (n === 0) return null;
    return { f: 1, powerBonus: 10 * n, d: '敌方携带' + n + '种系别→攻击威力+' + (n * 10) };
  });

// 光度换算：携带的火系技能获得选择：使用后失去15%生命，光系技能威力永久+30
//   火系技能的「选择」改造未实现；勾选即给威力 +30（默认未勾选）。
//   ⚠️ 按需求做成「勾选即生效」，不再按当前技能属性过滤（描述里写的是光系技能，
//      是否在光系技能上勾选由使用者判断）。
defineAtkTraitRule(['光度换算'], () => [ck('activated', '「选择」已生效（威力+30）', false)],
  ctx => ctx.opts.activated
    ? { f: 1, powerBonus: 30, d: '「选择」已生效→威力+30' }
    : null);

// 冰雪魂魄：天气为暴风雪时，冰系技能威力+100%
defineAtkTraitRule(['冰雪魂魄'],
  () => [ck('blizzard', '天气为暴风雪', false)],
  ctx => (ctx.opts.blizzard && ctx.skAttr === '冰')
    ? { f: 1, powerMult: 2, d: '暴风雪→冰系技能威力×2' } : null);

// 冷光源：上回合双方有精灵使用翼系技能，本回合冰系技能威力+100%
defineAtkTraitRule(['冷光源'],
  () => [ck('lastWing', '上回合双方有精灵使用翼系技能', false)],
  ctx => (ctx.opts.lastWing && ctx.skAttr === '冰')
    ? { f: 1, powerMult: 2, d: '上回合有翼系技能→冰系技能威力×2' } : null);

// 热成像：上回合双方有精灵使用火系技能，本回合虫系技能威力+100%
defineAtkTraitRule(['热成像'],
  () => [ck('lastFire', '上回合双方有精灵使用火系技能', false)],
  ctx => (ctx.opts.lastFire && ctx.skAttr === '虫')
    ? { f: 1, powerMult: 2, d: '上回合有火系技能→虫系技能威力×2' } : null);

// 秋收：处于草系环境中时，机械系技能威力+50%
defineAtkTraitRule(['秋收'],
  () => [ck('grassField', '处于草系环境', false)],
  ctx => (ctx.opts.grassField && ctx.skAttr === '机械')
    ? { f: 1, powerMult: 1.5, d: '草系环境→机械系技能威力×1.5' } : null);

// ============================================================
// 批次新增（2026-10）—— 攻防属性 11 条（通道 atkM）
// ============================================================
// 说明：
//   · 只改攻（物攻/魔攻）→ 仅登记攻方表；只改防（物防/魔防）→ 仅登记防方表；
//     攻防都改 → 双侧登记（另一侧由 collectStatBuffs 的角色取键过滤）。
//   · 速度分量（spd）当前不进伤害公式、也不进面板，仅保留语义字段。
//   · 未实现（按项目约定/数值缺失）：毒牙、虚假宝箱、吉利丁片、美拉德反应、御驾亲征。
// ------------------------------------------------------------

// 裁决 / 滋养 / 点燃 / 净化 已合并到上方「最好的伙伴」叠层规则（克制触发次数）

// 囤积：每有1能量，获得双防+10%（纯防御 → 仅防方表）
defineDefTraitRule(['囤积'],
  () => [num('energy', '当前能量', 0, 0, 10)],
  ctx => {
    const n = Math.max(0, ctx.opts.energy || 0);
    if (n === 0) return null;
    return { f: 1, d: '能量' + n + '→双防+' + (n * 10) + '%', stat: st({ pdef: { pct: 0.1 * n }, mdef: { pct: 0.1 * n } }) };
  });

// 威慑：打断敌方时，自己获得双攻+30%（按打断次数叠加）
defineAtkTraitRule(['威慑'],
  () => [num('interruptUses', '打断敌方次数', 0, 0, 10)],
  ctx => {
    const n = Math.max(0, ctx.opts.interruptUses || 0);
    if (n === 0) return null;
    return {
      f: 1, d: '打断敌方' + n + '次→双攻+' + (n * 30) + '%',
      stat: st({ patk: { pct: 0.3 * n }, matk: { pct: 0.3 * n } }),
    };
  });

// 游弋：蓄力时可以使用任一携带技能，且获得双防+100%（纯防御 → 仅防方表）
defineDefTraitRule(['游弋'],
  () => [ck('charging', '处于蓄力状态', false)],
  ctx => ctx.opts.charging
    ? { f: 1, d: '蓄力中→双防+100%', stat: st({ pdef: { pct: 1 }, mdef: { pct: 1 } }) }
    : null);

// 图书守卫者：入场时，若自己魔力值为1，自己获得双攻+100%
defineAtkTraitRule(['图书守卫者'],
  () => [ck('selfMana1', '入场时自己魔力值为1', false)],
  ctx => ctx.opts.selfMana1
    ? { f: 1, d: '自己魔力值为1→双攻+100%', stat: st({ patk: { pct: 1 }, matk: { pct: 1 } }) }
    : null);

// 构装契约者：入场时，若敌方魔力值为1，自己获得双防+100%（纯防御 → 仅防方表）
defineDefTraitRule(['构装契约者'],
  () => [ck('foeMana1', '入场时敌方魔力值为1', false)],
  ctx => ctx.opts.foeMana1
    ? { f: 1, d: '敌方魔力值为1→双防+100%', stat: st({ pdef: { pct: 1 }, mdef: { pct: 1 } }) }
    : null);

// 淬炼火：入场前己方精灵每使用1次火系技能，获得攻防+10%、速度+10%（最多10次）
defineBothTraitRule(['淬炼火'],
  () => [num('fireUses', '入场前己方火系技能次数', 0, 0, 10)],
  ctx => {
    const n = Math.max(0, Math.min(10, ctx.opts.fireUses || 0));
    if (n === 0) return null;
    const p = 0.1 * n;
    return {
      f: 1, d: '火系技能' + n + '次→攻防+' + (n * 10) + '%、速度+' + (n * 10),
      stat: st({ patk: { pct: p }, matk: { pct: p }, pdef: { pct: p }, mdef: { pct: p }, spd: { pct: p } }),
    };
  });

// 旧玩具：己方精灵每使用过1个不同系别的技能，自己入场时获得双攻+10%
defineAtkTraitRule(['旧玩具'],
  () => [num('attrKinds', '己方使用过的不同系别数', 0, 0, 18)],
  ctx => {
    const n = Math.max(0, ctx.opts.attrKinds || 0);
    if (n === 0) return null;
    return { f: 1, d: '不同系别' + n + '个→入场双攻+' + (n * 10) + '%', stat: st({ patk: { pct: 0.1 * n }, matk: { pct: 0.1 * n } }) };
  });

// ============================================================
// 批次新增（2026-10）—— 受伤 / 增伤类 2 条（f 通道，仅防方表）
// ============================================================
// 说明：`f` 只用于「伤害总乘算 / 减伤」。这里的 +25% 是「自己受到的伤害提高」，
//   所以 f = 1.25 —— 与偏振/绝对秩序同族，只是方向相反。
// ------------------------------------------------------------

// 狂欢开始：在场时背包会变化出随机精灵…；本精灵受到的克制伤害+25%（3 只）
//   克制判定由 index.html 注入 ctx.typeEff（来袭技能属性 vs 防方自身属性），无需用户勾选。
defineDefTraitRule(['狂欢开始'], () => [],
  ctx => (ctx.typeEff >= 2)
    ? { f: 1.25, d: '受到的克制伤害+25%→×1.25' }
    : null);

// 展翅：在场时自己携带的普通系技能变为翼系；若后于敌方行动，自己受到的伤害+25%（3 只）
//   本次只实现减伤部分；「普通系技能→翼系技能」的技能属性改造未实现。
defineDefTraitRule(['展翅'],
  () => [ck('slower', '后于敌方行动（防方速度更低）', false)],
  ctx => ctx.opts.slower
    ? { f: 1.25, d: '后手→受到的伤害+25%→×1.25' }
    : null);

// ============================================================
// 批次新增（2026-11）—— 新精灵特性（469-492 / 245 琉璃君主 / 254 圣冠布鲁斯）
// ============================================================
// 说明：下列特性无伤害影响，**不登记规则**（UI 只显示「特性倍率」，用户可手填）：
//   深层侵蚀（中毒层数）、沙滩节拍（能耗）、环天顶弧（星陨印记）、
//   高吹雪（天气）、虫草多糖（奉献/寄生）、游戏的本质（随机点数）
//   （恶龙的奢望已实现，见下方「等级类特性」——等级增量 + 防方易伤）
// ------------------------------------------------------------

// 烈冰钻（圣冠布鲁斯）：敌方携带技能总能耗每 1 点 → 攻击威力 +10%；敌方总能耗 >15 时自己获得速度+75
defineAtkTraitRule(['烈冰钻'], () => [num('enemyTotalCost', '敌方携带技能总能耗', 0, 0, 20)],
  ctx => {
    const n = ctx.opts.enemyTotalCost || 0;
    if (n <= 0) return null;
    const m = 1 + 0.1 * n;
    const out = { f: 1, powerMult: m, d: '烈冰钻(敌总能耗' + n + ')→威力×' + m.toFixed(2) };
    if (n > 15) {
      out.d += '、速度+75';
      out.stat = st({ spd: { flat: 75 } });
    }
    return out;
  });

// 银头寸（地银链/地底银鳞/地绡银龙）：自己每消耗 1 点能量，回合结束时获得魔攻+10%
defineBothTraitRule(['银头寸'], () => [num('energySpent', '已消耗能量点数', 0, 0, 30)],
  ctx => {
    const n = Math.max(0, Math.min(30, ctx.opts.energySpent || 0));
    if (n <= 0) return null;
    const p = 0.1 * n;
    return {
      f: 1, d: '消耗' + n + '点能量→魔攻+' + (n * 10) + '%',
      stat: st({ matk: { pct: p } }),
    };
  });

// 储备金（沉金兽/龙头金/龙嵴金脉）：自己每使用 1 次聚能，回合结束时获得物攻+50%
defineBothTraitRule(['储备金'], () => [num('chargeUses', '已使用聚能次数', 0, 0, 10)],
  ctx => {
    const n = Math.max(0, Math.min(10, ctx.opts.chargeUses || 0));
    if (n <= 0) return null;
    const p = 0.5 * n;
    return {
      f: 1, d: '聚能' + n + '次→物攻+' + (n * 50) + '%',
      stat: st({ patk: { pct: p } }),
    };
  });

// 换牙（乐乐鲨/阿瓦鲨）：驱散 1 次自身减益后，物攻永久+50%（最多触发 1 次）
defineBothTraitRule(['换牙'], () => [ck('cleansed', '已驱散过自身减益', false)],
  ctx => ctx.opts.cleansed
    ? { f: 1, d: '驱散减益→物攻永久+50%', stat: st({ patk: { pct: 0.5 } }) }
    : null);

// 护犊（蛋包蛋/鸡麻麻）：队伍中存在被萌化的精灵时，自己获得双防+50%（纯防御 → 仅防方表）
defineDefTraitRule(['护犊'], () => [ck('charmedAlly', '队伍中存在被萌化的精灵', false)],
  ctx => ctx.opts.charmedAlly
    ? { f: 1, d: '队伍有萌化精灵→双防+50%', stat: st({ pdef: { pct: 0.5 }, mdef: { pct: 0.5 } }) }
    : null);

// 剪影（小剪影/影子剪纸）：敌方精灵离场时，自己获得技能威力+20（可累积）
defineAtkTraitRule(['剪影'], () => [num('stackCount', '敌方精灵离场次数', 0, 0, 10)],
  ctx => {
    const n = Math.max(0, Math.min(10, ctx.opts.stackCount || 0));
    if (n <= 0) return null;
    return { f: 1, powerBonus: 20 * n, d: '敌方离场' + n + '次→技能威力+' + (n * 20) };
  });

// ============================================================
// 等级类特性（2026-11）—— 特性直接指定「当前等级」，等级再驱动面板值与等级判定
// ============================================================
// 等级口径（与 js/01 calcRealStat / js/03 getEffectiveLevel 同一套）：
//   · 本表登记「哪些特性按等级结算」+ 等级输入框的范围（label/def/min/max/step）。
//     持有这类特性时，生效等级 = 条件框里手填的等级（默认取各特性登记的 def：99 / 60），
//     而非隐藏基础等级 60
//   · 等级决定面板值 → 条件变化时 js/03 会调 recalcStats(side) 重算
//   · 规则内部直接用 ctx.level（当前生效等级），不要自己再算
// ------------------------------------------------------------
const TRAIT_LEVEL_RULES = {};   // 特性名 → { label, def, min, max, step }
function defineTraitLevelRule(names, opts) {
  names.forEach(n => { TRAIT_LEVEL_RULES[n] = opts; });
}
function getTraitLevelRule(traitName) {
  return (traitName && TRAIT_LEVEL_RULES[traitName]) || null;
}
// 等级条件字段（按登记表生成，避免默认值写在两处）
const levelField = (rule) => [num('level', rule.label, rule.def, rule.min, rule.max, rule.step)];

// 恶龙的奢望（小冥龙 / 冥古龙）：初始等级+39（60+39=99），回合结束时等级-10，低于80级时受到伤害+40%
//   · 回合衰减直接用「等级」输入框表达（默认 99，步进 10 → 99 / 89 / 79 …），等级同步折算面板值
//   · 「低于80级时受伤+40%」只登记防方表（f=1.4）；攻方侧只显示等级，无增伤
defineTraitLevelRule(['恶龙的奢望'], { label: '等级', def: 99, min: 9, max: 99, step: 10 });

defineAtkTraitRule(['恶龙的奢望'],
  () => levelField(getTraitLevelRule('恶龙的奢望')),
  ctx => {
    const lv = (typeof ctx.level === 'number' && ctx.level > 0) ? ctx.level : 99;
    return { f: 1, d: '当前等级' + lv + '（<80 时受到伤害+40%）' };
  });

defineDefTraitRule(['恶龙的奢望'],
  () => levelField(getTraitLevelRule('恶龙的奢望')),
  ctx => {
    const lv = (typeof ctx.level === 'number' && ctx.level > 0) ? ctx.level : 99;
    return (lv < 80)
      ? { f: 1.4, d: '当前等级' + lv + '（<80）→受到伤害+40%→×1.4' }
      : { f: 1, d: '当前等级' + lv + '（≥80，无易伤）' };
  });

// 圣龙的心愿（493 阿布）：己方每使用 1 次能耗为 3 的技能，自己入场前等级+2；低于 80 级时受到伤害+30%
//   · 等级输入框表达累计后的入场等级（默认 60，步进 2 → 60 / 62 / 64 …，按使用次数换算）
//   · 等级同步折算面板值与等级系数（getEffectiveLevel / damageLevelCoef）
//   · 「低于80级受伤+30%」只登记防方表（f=1.3）；攻方侧只显示等级，无增伤
defineTraitLevelRule(['圣龙的心愿'], { label: '等级', def: 60, min: 60, max: 99, step: 1 });

defineAtkTraitRule(['圣龙的心愿'],
  () => levelField(getTraitLevelRule('圣龙的心愿')),
  ctx => {
    const lv = (typeof ctx.level === 'number' && ctx.level > 0) ? ctx.level : 60;
    return { f: 1, d: '当前等级' + lv + '（<80 时受到伤害+30%）' };
  });

defineDefTraitRule(['圣龙的心愿'],
  () => levelField(getTraitLevelRule('圣龙的心愿')),
  ctx => {
    const lv = (typeof ctx.level === 'number' && ctx.level > 0) ? ctx.level : 60;
    return (lv < 80)
      ? { f: 1.3, d: '当前等级' + lv + '（<80）→受到伤害+30%→×1.3' }
      : { f: 1, d: '当前等级' + lv + '（≥80，无易伤）' };
  });

// 圣龙的守护（493 超能阿布·首领）：战斗中每提升 1 级 → 物攻+5%；低于 80 级时受到伤害+30%
//   · 等级口径同上：默认 60，每 +1 级物攻 +5%（相对 60 级线性展开，不连乘）
//   · 物攻加成走 stat.patk.pct（攻方表）；防方表只负责易伤 f ——
//     防方 stat 只采纳 pdef/mdef，物攻加成对来袭伤害无影响
defineTraitLevelRule(['圣龙的守护'], { label: '等级', def: 60, min: 60, max: 99, step: 1 });

defineAtkTraitRule(['圣龙的守护'],
  () => levelField(getTraitLevelRule('圣龙的守护')),
  ctx => {
    const lv = (typeof ctx.level === 'number' && ctx.level > 0) ? ctx.level : 60;
    const pct = Math.max(0, lv - 60) * 0.05;
    return {
      f: 1,
      d: '当前等级' + lv + '→物攻+' + Math.round(pct * 100) + '%',
      stat: pct > 0 ? st({ patk: { pct } }) : null,
    };
  });

defineDefTraitRule(['圣龙的守护'],
  () => levelField(getTraitLevelRule('圣龙的守护')),
  ctx => {
    const lv = (typeof ctx.level === 'number' && ctx.level > 0) ? ctx.level : 60;
    return (lv < 80)
      ? { f: 1.3, d: '当前等级' + lv + '（<80）→受到伤害+30%→×1.3' }
      : { f: 1, d: '当前等级' + lv + '（≥80，无易伤）' };
  });

// ============================================================
// 通道声明表（静态）—— 决定 UI 显示哪些输入框
// ============================================================
// 为什么需要这张表：
//   UI 的输入框显隐必须由「规则**声明了**哪些通道」决定，
//   而**不是**由「条件当前是否满足」决定。
//   反例：蒸汽膨胀定义了 powerBonus（全技能威力+10/次），
//         但层数默认 0 时 eff() 返回 null。若按运行时结果判显隐，
//         就会错误地退化成显示「特性倍率」（结算层），与规则语义不符。
//   正例：烈火守护（蒸汽膨胀）应始终只显示「特性威力」（威力层加法段）。
//
// 通道含义：
//   mult —— 结算层「特性倍率」：纯伤害乘算 / 减伤（f 通道）
//   pwM  —— 威力层「特性威力倍率」：powerMult（含 powerPct 折算）
//   pwA  —— 威力层「特性威力」：powerBonus（威力加算）
//   atkM —— 攻击/防御层「特性攻击倍率」：stat 的百分比加成
//   atkA —— 攻击/防御层「特性攻击」：stat 的固定点数加成
//
// 显示规则（js/03-trait.js 的 traitInputKinds）：
//   pwM / pwA / atkM / atkA / mult 各自对应一个输入框，可并列显示
//   规则表未登记 → 只显示「特性倍率」（兜底）
//   ⚠️ 同一特性攻/防侧通道不同 → 用 { sides: { atk: <ch>, def: <ch> } } 按侧声明，
//      由 getTraitChannelsForSide(name, side) 解析；普通登记仍走下方自动推导
const CH_NONE = { };                                        // 无通道（未登记）
const CH_MULT = { mult: true };                             // 仅结算层倍率
const CH_PWM  = { pwM: true };                              // 仅威力倍率
const CH_PWA  = { pwA: true };                              // 仅威力加成
const CH_PWM_PWA = { pwM: true, pwA: true };                // 威力倍率 + 威力加成
const CH_ATKM = { atkM: true };                             // 仅攻击百分比加成
const CH_ATKM_PWA = { atkM: true, pwA: true };             // 攻击百分比 + 威力加成

const TRAIT_CHANNELS = {
  // ── 纯威力倍率（能耗 / 先手 / 属性判定 / 应对 / 层数类）──
  '挺起胸脯': CH_PWM, '“国王”的威严': CH_PWM,
  '勇敢': CH_PWM,
  '顺风': CH_PWM,
  '破空': CH_PWM,
  '目空': CH_PWM, '夺目': CH_PWM,
  '涂鸦': CH_PWM,
  '圣火骑士': CH_PWM,
  '不移': CH_PWM,
  '水翼飞升': CH_PWM,
  '天通地明': CH_PWM,
  '观星': CH_PWM,
  '坠星': CH_PWM,
  '冰钻': CH_PWM,
  '变形活画': CH_PWM,
  '身经百练': CH_PWM,
  '月光审判': CH_PWM,
  '绒粉星光': CH_PWM,

  // ── 纯威力加成（加算）──
  '蒸汽膨胀': CH_PWA,                    // 烈火守护等：全技能威力 +10/次
  '蒸汽革命': CH_ATKM_PWA,               // 物防 +5%·层 + 全技能威力 +10·层

  // ── 攻防属性百分比加成（双攻 / 攻防 / 攻防速）──
  '专注力': CH_ATKM,
  '全神贯注': CH_ATKM,
  '壮胆': CH_ATKM,
  '得寸进尺': CH_ATKM,
  '最好的伙伴': CH_ATKM,
  '裁决': CH_ATKM, '滋养': CH_ATKM, '点燃': CH_ATKM, '净化': CH_ATKM,  // 共用「最好的伙伴」叠层规则
  '助燃': CH_ATKM,
  '爆燃': CH_ATKM,
  '鼓气': CH_ATKM,
  '蓄电池': CH_ATKM,
  '超级电池': CH_ATKM,
  '悲悯': CH_ATKM,
  '悼亡': CH_ATKM,
  '虫群鼓舞': CH_ATKM,
  '虫群突袭': CH_ATKM,
  '指挥家': CH_ATKM,
  '三鼓作气': CH_ATKM,
  '恶魔的晚宴': CH_ATKM,
  '渗透': CH_ATKM,
  '草木苏醒时': CH_ATKM,
  '贪得无厌': CH_ATKM,
  '合拍': CH_ATKM,
  '搜刮': CH_ATKM,
  '扫荡': CH_ATKM,
  '守护之心': CH_ATKM,
  '和弦共振': CH_ATKM,
  '猫精灵的礼物': CH_ATKM,
  '宇宙之眼': CH_ATKM,
  '先知': CH_ATKM,
  '张弛有度': CH_ATKM,

  // ── 防方减伤（f 通道）──
  '恶龙的奢望': CH_MULT,                 // 等级 <80 → 受到伤害 ×1.4（等级增量另走 TRAIT_LEVEL_RULES）
  '偏振': CH_MULT,
  '完全偏振': CH_MULT,
  '绝对秩序': CH_MULT,

  // ── 防方属性加成 ──
  '保守派': CH_ATKM,
  '狂欢开始': CH_MULT,
  '展翅': CH_MULT,
  '囤积': CH_ATKM,
  '游弋': CH_ATKM,
  '构装契约者': CH_ATKM,

  // ── 2026-10 批次：威力类（+威力加成 / ×威力倍率）──
  '电流刺激': CH_PWA,
  '共鸣': CH_PWA,
  '齐鸣': CH_PWA,
  '拨浪鼓': CH_PWA,
  '向心力': CH_PWA,
  '斗技': CH_PWA,
  '血型吸引': CH_PWA,
  '光度换算': CH_PWA,
  '冻土': CH_PWM,
  '定向精炼': CH_PWM,
  '冰雪魂魄': CH_PWM,
  '冷光源': CH_PWM,
  '热成像': CH_PWM,
  '秋收': CH_PWM,

  // ── 2026-10 批次：攻防属性（stat 百分比）──
  // 裁决 / 滋养 / 点燃 / 净化 已移至上方「最好的伙伴」旁
  '威慑': CH_ATKM,
  '图书守卫者': CH_ATKM,
  '淬炼火': CH_ATKM,
  '旧玩具': CH_ATKM,

  // ── 2026-11 批次：新精灵（245 琉璃君主 / 254 圣冠布鲁斯 / 469-492）──
  '烈冰钻': CH_PWM,
  '银头寸': CH_ATKM,
  '储备金': CH_ATKM,
  '换牙': CH_ATKM,
  '护犊': CH_ATKM,
  '剪影': CH_PWA,

  // ── 2026-11 批次：493 阿布 / 超能阿布（等级类特性）──
  '圣龙的心愿': CH_MULT,                 // 等级 <80 → 受到伤害 ×1.3
  // 双通道特性：攻方是 stat.patk 百分比（atkM），防方是 f 易伤（mult）。
  //   按侧声明分别指定，否则一条登记只能选一个通道，防方的 ×1.3 会落到
  //   不可见的「特性倍率」上，面板只显示一个恒 1.0 的「特性防御倍率」。
  '圣龙的守护': { sides: { atk: CH_ATKM, def: CH_MULT } },
};

// 取某特性声明的**原始**通道；未登记返回 null（UI 退化为只显示「特性倍率」）。
//   值可以是普通通道对象，也可以是 { sides: { atk, def } } 按侧声明；
//   UI 查询一律走 getTraitChannelsForSide(name, side)，由它解析 sides。
function getTraitChannels(traitName) {
  if (!traitName) return null;
  const ch = TRAIT_CHANNELS[traitName];
  return ch === undefined ? null : ch;
}

// 按「侧」取通道声明
//   ① 按侧声明 { sides: { atk, def } }：显式指定优先，直接返回该侧通道，跳过自动推导。
//      用于同一特性攻/防侧落在不同层的场景（圣龙的守护：攻方 stat.atkM / 防方 f.mult）。
//   ② 普通通道对象：防方做自动推导 —— 防方路径 calcDefTraitMult 只采纳 f 与 stat，
//      威力层通道（pwM / pwA）在防方永不生效：
//        · 不在 DEF_TRAIT_RULES 里的特性 = 攻方专属（只增强持有者自己出手的技能，
//          如蒸汽膨胀「己方每用1次火系技能→全技能威力+10」），当防方时对来袭伤害毫无作用，
//          防方面板只应显示「特性倍率」（1.0），不能出现「特性威力」并被误当成减伤/威力加成。
//        · 在 DEF_TRAIT_RULES 里的特性：剔除威力层通道，只保留 mult / atkM / atkA；
//          剔完为空则同样退化为「特性倍率」。
function getTraitChannelsForSide(traitName, side) {
  const raw = getTraitChannels(traitName);
  if (!raw) return null;
  if (raw.sides) {
    const ch = side === 'def' ? raw.sides.def : raw.sides.atk;
    return ch === undefined ? null : ch;
  }
  if (side !== 'def') return raw;
  if (!DEF_TRAIT_RULES[traitName]) return CH_MULT;
  const defCh = {};
  if (raw.mult) defCh.mult = true;
  if (raw.atkM) defCh.atkM = true;
  if (raw.atkA) defCh.atkA = true;
  return Object.keys(defCh).length ? defCh : CH_MULT;
}

// 通道 → UI 输入框 kind 列表（供 js/03-trait.js 的 traitInputKinds 使用）
//   mult → '特性倍率'（结算层）
//   pwM  → '特性威力倍率'（威力层乘法段）
//   pwA  → '特性威力'（威力层加法段）
//   atkM → '特性攻击倍率' / '特性防御倍率'（攻击层/防御层）
//   atkA → '特性攻击' / '特性防御'（攻击层/防御层）
function traitChannelsToKinds(ch) {
  if (!ch) return ['mult'];
  // 允许直接传原始按侧登记值（如校验脚本）：按攻方解析
  if (ch.sides) ch = ch.sides.atk || {};
  const kinds = [];
  if (ch.pwM) kinds.push('powerMult');
  if (ch.pwA) kinds.push('powerAdd');
  if (ch.atkM) kinds.push('atkMult');
  if (ch.atkA) kinds.push('atkAdd');
  // mult 是可并列通道：显式声明时与其它输入框一起显示；
  // 未声明任何具体通道时仍作兜底（含「仅 mult」与「未登记」）。
  if (ch.mult || kinds.length === 0) kinds.push('mult');
  return kinds;
}

// ============================================================
// 精灵名 → 计算用特性名（首领/特殊形态沿用基础形态的特性计算规则）
//   · 键 = data/spirits.js 的 n 字段（完整形态名），值 = 参与查表的特性名
//   · 只影响「规则 / 通道 / 条件框 / 等级规则」的查表名；
//     卡片与特性面板标题仍显示 spirits.js 里的真实 tr（御驾亲征），不受影响
//   · 用它的原因：规则表按特性名索引，而「御驾亲征」被 8 只棋契陛下共用，
//     按特性名登记会一次性影响全部 8 只，无法只对某个分支生效
//   · js/ 里凡是用 spirit.tr 去查 ATK_TRAIT_RULES / DEF_TRAIT_RULES /
//     TRAIT_CHANNELS / TRAIT_LEVEL_RULES 的地方，都必须改用 resolveTraitName(spirit)
// ============================================================
const SPIRIT_TRAIT_ALIAS = {
  // 棋绮后分支首领：与「棋绮后（白子/黑子）」同为 渗透
  '棋契陛下（白棋棋绮后分支）': '渗透',
  '棋契陛下（黑棋棋绮后分支）': '渗透',
};

// 取某只精灵参与查表的特性名；无别名时等同 spirit.tr
function resolveTraitName(spirit) {
  if (!spirit) return null;
  const alias = SPIRIT_TRAIT_ALIAS[spirit.n];
  return alias || spirit.tr || null;
}

