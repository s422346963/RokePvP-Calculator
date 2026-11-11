// ============================================================
// 技能「本次威力 / 连击」修正规则表
//
// 与 data/traitMult.js 同构的注册式规则表。解决 skills.js 中 84 条
// 「desc 含威力变动」的技能此前只能靠 index.html 里逐个 if 硬编码的问题。
//
// 设计要点：
//   - 本文件只描述「技能的威力修正」，不涉及特性（特性见 traitMult.js），
//     也不涉及攻防属性加成（见 traitMult.js 的 stat 通道）。
//   - 修正严格遵循「先加减、后乘除」（见 AGENTS.md「伤害公式：四层拆分」）：
//       基础威力区     = 基础威力 × powerMult（应对倍率「×N / 威力翻倍」这类描述）
//       固定威力提升区 = powerAdd + 特性 powerBonus（由 index.html 合并，求和）
//       技能威力乘区   = 1 + powerPct + 特性 powerMult 的增量（跨来源求和）
//       powerFinal     = (基础威力区 + 固定威力提升区) × 技能威力乘区
//     因此「变为 N 倍」用 powerMult（进基础威力区），「+N」用 powerAdd（进固定提升区），
//     「+N%」用 powerPct（进技能威力乘区，与其他百分比来源相加）。
//   - 本文件是纯数据 + 纯函数，不做任何 DOM 操作。所有面板值、查表函数
//     由 index.html 通过 ctx.util 注入，避免与 index.html 行内脚本产生加载期耦合。
//   - 必须保持全局常量（const），不得加 defer、不得移回 <head>。
//     加载顺序：spirits → skills → type → traitMult → skillMult → pinyin → spiritsPvP
//
// 一条规则 = 一个技能名（或一组共享同一逻辑的技能名）：
//   fields(skill) → 该技能需要用户输入的字段（渲染成复选框 / 数字框 / 下拉框）
//   eff(ctx)      → { powerSet, powerAdd, powerPct, powerMult, hitsSet, label, implemented }
//                   条件不满足时返回 null（不加成、不显示修正项）
//   powerSet：「本技能威力等于 N」类规则直接给出目标威力，由调用方写回基础威力输入框，
//            不进固定威力提升区（拆解里不产生「技能威力加成」项）。
//   ctx 结构：
//   { skill, skAttr, skCost, skKind, skHits, atk, def,
//     atkA1, atkA2, defA1, defA2, opts, util }
//
// 未实现的技能不注册规则；index.html 会检测「desc 含威力但无规则」的情况，
// 在 UI 上显式提示「条件规则待补全，请手动填写」，严禁静默按 0 处理。
// ============================================================

const SKILL_POWER_RULES = {};

function defineSkillPowerRule(names, fieldsFn, effFn) {
  const rule = { fields: fieldsFn, eff: effFn };
  names.forEach(n => { SKILL_POWER_RULES[n] = rule; });
}

// 输入字段构造器（独立命名空间，避免与 traitMult.js 的 ck()/num() 冲突）
const spCk = (key, label, def) => ({ id: 'pwr-opt-' + key, label, type: 'checkbox', key, def: !!def });
const spNum = (key, label, def, min, max) => ({ id: 'pwr-opt-' + key, label, type: 'number', key, def, min, max });
// 下拉框：选项由渲染层按 tableKey 从 ctx.util 注入的查表数据生成（data 层不得直接引用
//   js/01-core.js 的 SPEED_DIFF_TABLE —— 加载期还不存在）。value 一律取威力数值，
//   故 readPowerOptsByMode 的 parseInt 分支无需改动就能读到用户选中的档位。
const spSel = (key, label, def, tableKey, prefix) =>
  ({ id: 'pwr-opt-' + key, label, type: 'select', key, def, tableKey, prefix });

// 常用条件字段（多处复用，避免重复字面量）
const F_COUNTERED = () => [spCk('countered', '应对成功', false)];
const F_FOE_SWITCH = () => [spCk('foeSwitched', '敌方本回合更换精灵', false)];
const F_HP_PCT = () => [spNum('hpPct', '自身当前生命%', 100, 0, 100)];

// ------------------------------------------------------------
// 通用「本次被应对 → 威力变为 N 倍」
//   偷袭 ×3 / 突袭 ×3 / 无影脚 ×2 / 爆冲 ×5 / 技巧打击 ×10 / 闪燃 ×4 /
//   龙卷风 ×1.5 / 虫击 ×2
//   （迁移自 index.html 迁移前的 countertSkills 硬编码）
// ------------------------------------------------------------
const COUNTER_MULT = {
  '偷袭': 3, '突袭': 3, '无影脚': 2, '爆冲': 5,
  '技巧打击': 10, '闪燃': 4, '龙卷风': 1.5, '虫击': 2,
};

defineSkillPowerRule(Object.keys(COUNTER_MULT), F_COUNTERED, ctx => {
  if (!ctx.opts.countered) return null;
  const m = COUNTER_MULT[ctx.skill.n];
  return { powerMult: m, label: '应对状态→威力×' + m };
});

// 愿力冲击（18 条按属性名）：应对状态 → 本次技能威力 ×2.5
//   技能名为「愿力冲击(属性)」，故用属性列表拼名注册；k='双攻' 由 index.html 决定取物攻还是魔攻
defineSkillPowerRule(
  ['普通','草','火','水','光','地','冰','龙','电','毒','虫','武','翼','萌','幽','恶','机械','幻']
    .map(t => '愿力冲击(' + t + ')'),
  F_COUNTERED,
  ctx => ctx.opts.countered ? { powerMult: 2.5, label: '应对状态→本次威力×2.5' } : null);

// ------------------------------------------------------------
// 传动系「站位 → 威力 +N」
//   钢铁洪流 1号位 +90 / 械斗 1号位 +60 /
//   离子震荡 3号位 +40 / 磁暴 1或3号位 +30
//   （迁移自 index.html 迁移前的 positionSkills 硬编码）
//   desc 尾部的「传动N」是机械系传动计数，对自身威力无贡献，仅写入备注。
// ------------------------------------------------------------
const POSITION_ADD = {
  '钢铁洪流': { key: 'pos1', label: '本技能位于1号位', add: 90, note: '传动2' },
  '械斗':     { key: 'pos1', label: '本技能位于1号位', add: 60, note: '传动1' },
  '离子震荡': { key: 'pos3', label: '本技能位于3号位', add: 40, note: '传动1' },
  '磁暴':     { key: 'pos13', label: '本技能位于1号位或3号位', add: 30, note: '传动1' },
};

defineSkillPowerRule(Object.keys(POSITION_ADD), skill => {
  const cfg = POSITION_ADD[skill.n];
  return [spCk(cfg.key, cfg.label, false)];
}, ctx => {
  const cfg = POSITION_ADD[ctx.skill.n];
  if (!ctx.opts[cfg.key]) return null;
  return { powerAdd: cfg.add, label: cfg.label + '→威力+' + cfg.add + (cfg.note ? '（' + cfg.note + '）' : '') };
});

// ------------------------------------------------------------
// HP 阈值 / 损失量类
// ------------------------------------------------------------

// 垂死反击：自己每失去5%生命，本次技能威力+5
defineSkillPowerRule(['垂死反击'], F_HP_PCT, ctx => {
  const hp = Math.max(0, Math.min(100, ctx.opts.hpPct || 0));
  const lost = Math.floor((100 - hp) / 5);
  const add = lost * 5;
  if (add === 0) return null;
  return { powerAdd: add, label: '生命' + hp + '%(损失' + (100 - hp) + '%)→威力+' + add };
});

// 彗星：每失去5%生命，本次技能威力-10（威力有下限，不低于 0）
defineSkillPowerRule(['彗星'], F_HP_PCT, ctx => {
  const hp = Math.max(0, Math.min(100, ctx.opts.hpPct || 0));
  const lost = Math.floor((100 - hp) / 5);
  const cut = lost * 10;
  if (cut === 0) return null;
  return { powerAdd: -cut, label: '生命' + hp + '%→威力-' + cut + '（使用后消耗全部生命）' };
});

// 筛管奔流：自己生命大于80%时，本次技能威力+75
defineSkillPowerRule(['筛管奔流'],
  () => [spCk('hpAbove80', '自身生命值大于80%', false)],
  ctx => ctx.opts.hpAbove80 ? { powerAdd: 75, label: '生命>80%→威力+75' } : null);

// 撒花：选择——生命大于80%时威力+50；另一分支为自愈35%，不产生威力字段
defineSkillPowerRule(['撒花'],
  () => [spCk('hpAbove80', '自身生命值大于80%', false)],
  ctx => ctx.opts.hpAbove80 ? { powerAdd: 50, label: '生命>80%→威力+50' } : null);

// 下注：默认 +40；生命低于50%时 +100
defineSkillPowerRule(['下注'],
  () => [spCk('hpBelow50', '自身生命值低于50%', false)],
  ctx => ctx.opts.hpBelow50
    ? { powerAdd: 100, label: '生命<50%→威力+100（否则+40）' }
    : { powerAdd: 40, label: '默认分支→威力+40' });

// ------------------------------------------------------------
// 能量 / 状态回合类
// ------------------------------------------------------------

// 触底强击：使用后若能量耗尽，本次技能威力+120
defineSkillPowerRule(['触底强击'],
  () => [spNum('energyAfter', '使用后剩余能量', 0, 0, 10)],
  ctx => {
    const n = Math.max(0, Math.min(10, ctx.opts.energyAfter || 0));
    if (n > 0) return null;
    return { powerAdd: 120, label: '能量耗尽→威力+120' };
  });

// 甜蜜陷阱：自己每有1能量，本次技能威力+10
// 注意：n=0 时仍返回结果（powerAdd=0），避免条件输入框消失
defineSkillPowerRule(['甜蜜陷阱'],
  () => [spNum('energy', '自身当前能量', 0, 0, 10)],
  ctx => {
    const n = Math.max(0, Math.min(10, ctx.opts.energy || 0));
    return { powerAdd: 10 * n, label: '自身' + n + '能量→威力+' + (10 * n) };
  });

// 见招拆招：若上回合使用状态技能，本次技能威力+55
defineSkillPowerRule(['见招拆招'],
  () => [spCk('lastTurnStatus', '上回合己方使用状态技能', false)],
  ctx => ctx.opts.lastTurnStatus ? { powerAdd: 55, label: '上回合用状态技能→威力+55' } : null);

// 气势一击：若上回合应对成功，本次技能威力+180
defineSkillPowerRule(['气势一击'],
  () => [spCk('lastCountered', '上回合应对成功', false)],
  ctx => ctx.opts.lastCountered ? { powerAdd: 180, label: '上回合应对成功→威力+180' } : null);

// ------------------------------------------------------------
// 敌方本回合更换精灵
// ------------------------------------------------------------

// 当头棒喝 +100 / 草虫冲击 +90
// 两者 desc 另含「无视敌方系别抵抗」，属结算层 typeEff，不在本表实现
defineSkillPowerRule(['当头棒喝'], F_FOE_SWITCH,
  ctx => ctx.opts.foeSwitched ? { powerAdd: 100, label: '敌方换精灵→威力+100' } : null);

defineSkillPowerRule(['草虫冲击'], F_FOE_SWITCH,
  ctx => ctx.opts.foeSwitched ? { powerAdd: 90, label: '敌方换精灵→威力+90（并无视系别抵抗）' } : null);

// ------------------------------------------------------------
// 公式型（基础威力 p=1 为占位值，用 powerSet 直接改写基础威力）
//   怨力打击：威力 = 蓄力期间敌方使用的技能威力 × 3
//   钢钻：    威力 = 两侧技能威力和 ÷ 3
//   ⚠️ 与冰锋横扫同属「本技能威力等于…」，目标威力属于基础威力，
//      不再走 powerAdd（否则拆解里会多出一项「技能威力加成」）。
// ------------------------------------------------------------

// 两侧技能威力（钢钻 / 六自由度共用）：手填优先，util 的邻槽自动查询兜底。
//   ⚠️ buildPowerUtil 未注入 sidePower 时该函数仍存在但恒返回 0（B 模式、
//      FULL 邻槽为空），只认自动值会让「左/右侧技能威力」输入框完全失效。
function resolveSidePowers(ctx) {
  const o = ctx.opts || {};
  const manualL = Math.max(0, Number(o.leftPower) || 0);
  const manualR = Math.max(0, Number(o.rightPower) || 0);
  if (manualL + manualR > 0) return { l: manualL, r: manualR };
  const u = ctx.util;
  const auto = which => (u && typeof u.sidePower === 'function')
    ? Math.max(0, Number(u.sidePower(ctx, which)) || 0) : 0;
  return { l: auto('left'), r: auto('right') };
}

defineSkillPowerRule(['怨力打击'],
  () => [spCk('wasHit', '蓄力期间受到攻击', true), spNum('foePower', '蓄力期间敌方技能威力', 0, 0, 999)],
  ctx => {
    if (!ctx.opts.wasHit) return null;
    const foe = Math.max(0, Math.min(999, ctx.opts.foePower || 0));
    if (foe === 0) return null;
    const target = foe * 3;
    return { powerSet: target, label: '敌方威力' + foe + '×3→威力' + target };
  });

defineSkillPowerRule(['钢钻'],
  () => [spNum('leftPower', '左侧技能威力', 0, 0, 999), spNum('rightPower', '右侧技能威力', 0, 0, 999)],
  ctx => {
    const { l: lVal, r: rVal } = resolveSidePowers(ctx);
    if (lVal === 0 && rVal === 0) return null;
    const target = Math.round((lVal + rVal) / 3);
    return { powerSet: target, label: '(' + lVal + '+' + rVal + ')÷3→威力' + target };
  });

// ------------------------------------------------------------
// 查表型
//   闪击 / 鸣沙陷阱：**不再**按双方面板速度/物防自动判定威力，改为下拉手动选档位。
//     选项由渲染层按 fields.tableKey 从 ctx.util.speedDiffTable / pdefDiffTable 生成
//     （js/01-core.js 的 SPEED_DIFF_TABLE，两张表同一引用），文本形如
//     「190 (速度差241 ~ 270)」「200 (速度差≥ 271)」，value = 该档威力。
//     eff 只把选中的威力换算成 powerAdd（目标威力 − 技能基础威力 p=60），
//     B / FULL 共用同一条增量链路，不再需要自动覆盖槽位威力（见 resolveAutoPowerForSlot）。
//   魔能爆：消耗能量越多威力越高 → MANA_BURST_TABLE；与冰锋横扫 / 钢钻 / 怨力打击
//     同属「本技能威力等于 N」，powerSet 直接改写基础威力，不进加成
//   冰锋横扫：威力 = 敌方技能总能耗 × 10（手填优先；FULL 未填时按对手技能槽自动统计）
//   注：p=60 / p=1 均为占位值；闪击 / 鸣沙陷阱仍走 powerAdd（目标威力 − p），
//      魔能爆 / 冰锋横扫 / 钢钻 / 怨力打击走 powerSet（直接给出目标威力）
// ------------------------------------------------------------
const manualTierPower = prefix => ctx => {
  const p = Number(ctx.opts.tier);
  if (!Number.isFinite(p) || p <= 0) return null;
  return { powerAdd: p - (ctx.skill.p || 0), label: prefix + '档位→威力' + p };
};

defineSkillPowerRule(['闪击'],
  () => [spSel('tier', '速度差档位', 60, 'speedDiffTable', '速度差')],
  manualTierPower('速度差'));

defineSkillPowerRule(['鸣沙陷阱'],
  () => [spSel('tier', '物防差档位', 60, 'pdefDiffTable', '物防差')],
  manualTierPower('物防差'));

defineSkillPowerRule(['魔能爆'],
  () => [spNum('energy', '本次消耗能量', 0, 0, 10)],
  ctx => {
    const u = ctx.util;
    const n = Math.max(0, Math.min(10, ctx.opts.energy || 0));
    const table = u && u.manaBurstTable;
    if (!table) return null;
    const row = table.find(r => r[0] === n) || table[table.length - 1];
    return { powerSet: row[1], label: '消耗' + n + '能量→威力' + row[1] };
  });

defineSkillPowerRule(['冰锋横扫'],
  () => [spNum('foeTotalCost', '敌方携带技能总能耗', 0, 0, 40)],
  ctx => {
    const u = ctx.util;
    // 手填优先、自动兜底：B 模式没有敌方配招槽，util 的自动统计恒为 0（或用 FULL
    //   残留数据盖掉手填值），若只认自动值会让这个输入框完全失效。
    //   FULL 模式未填（0）时仍按对手技能槽自动统计。
    const manual = Math.max(0, Math.min(40, Number(ctx.opts.foeTotalCost) || 0));
    const auto = (u && typeof u.foeTotalCost === 'function') ? Number(u.foeTotalCost(ctx)) || 0 : 0;
    const cost = manual > 0 ? manual : Math.max(0, auto);
    if (cost === 0) return null;
    const target = cost * 10;
    return { powerSet: target, label: '敌方总能耗' + cost + '×10→威力' + target };
  });

// ------------------------------------------------------------
// 连击修正：暂时全部移除
//   连续爪击 / 追打 / 散手 / 灵光 原先改 hitsSet，现按「只影响连击数的技能不实现」处理，
//   连击数一律以 skills.js 的 cb 字段（技能固有连击）为准。
//   hitsSet 通道与 index.html 的读取逻辑保留，便于日后重新启用。
// ------------------------------------------------------------

// ------------------------------------------------------------
// 永久累积型（桶4）—— 一期仅落地描述明确、可自动判定的一条
//   山火：每使用1次其他火系技能，本技能威力永久翻倍 → 2^n（进乘除段）
// ------------------------------------------------------------

defineSkillPowerRule(['山火'],
  () => [spNum('fireCount', '已使用其他火系技能次数', 0, 0, 10)],
  ctx => {
    const n = Math.max(0, Math.min(10, ctx.opts.fireCount || 0));
    if (n === 0) return null;
    const m = Math.pow(2, n);
    return { powerMult: m, label: '火系技能×' + n + '次→威力×' + m + '（永久翻倍）' };
  });

// ============================================================
// 二期扩充：其余「desc 涉及威力变动」的技能
//   · 只影响连击数的技能不在本表（连击基准值见 skills.js 的 cb 字段）
//   · 以下 6 条刻意不实现，UI 继续显示「规则待补全，请手动填写」：
//       以重制重 / 吨位压制 / 砂糖弹球 —— desc 只说「体重越X威力越高」，无数值可算
//       撒娇 / 飞断 —— 影响「全技能威力 / 队伍奉献」的全局加成，本表语义是「本次技能威力修正」
//       持续高温 —— 影响「下次攻击技能」，属跨技能时序，本次伤害无法表达
// ============================================================

// 数字字段统一做上限保护
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v) || 0));
// 累积次数型字段构造器
const F_STACKS = (label, max) => () => [spNum('stacks', label, 0, 0, max === undefined ? 99 : max)];

// ------------------------------------------------------------
// 1) 永久累积成长：每次使用 / 击败 / 入场 / 位置变化 → 本技能威力永久 +N（或 ×2^n）
// ------------------------------------------------------------
defineSkillPowerRule(['迫近攻击'], F_STACKS('本技能已使用次数'), ctx => {
  const n = clampInt(ctx.opts.stacks, 0, 99);
  return n > 0 ? { powerAdd: 45 * n, label: '已使用' + n + '次→威力+' + (45 * n) } : null;
});

defineSkillPowerRule(['吹火'], F_STACKS('本技能已使用次数'), ctx => {
  const n = clampInt(ctx.opts.stacks, 0, 99);
  return n > 0 ? { powerAdd: 20 * n, label: '已使用' + n + '次→威力+' + (20 * n) } : null;
});

defineSkillPowerRule(['暖阳'], F_STACKS('已使用其他火系技能次数'), ctx => {
  const n = clampInt(ctx.opts.stacks, 0, 99);
  return n > 0 ? { powerAdd: 60 * n, label: '火系技能' + n + '次→威力+' + (60 * n) + '（使用本技能后重置）' } : null;
});

defineSkillPowerRule(['光能聚集'], F_STACKS('已使用其他草系技能次数'), ctx => {
  const n = clampInt(ctx.opts.stacks, 0, 99);
  return n > 0 ? { powerAdd: 60 * n, label: '草系技能' + n + '次→威力+' + (60 * n) } : null;
});

defineSkillPowerRule(['过曝'], F_STACKS('已使用过的其他系别技能数', 17), ctx => {
  const n = clampInt(ctx.opts.stacks, 0, 17);
  return n > 0 ? { powerAdd: 30 * n, label: '其他系别' + n + '个→威力+' + (30 * n) } : null;
});

defineSkillPowerRule(['齿轮扭矩'], F_STACKS('本技能位置变化次数'), ctx => {
  const n = clampInt(ctx.opts.stacks, 0, 99);
  return n > 0 ? { powerAdd: 15 * n, label: '位置变化' + n + '次→威力+' + (15 * n) } : null;
});

defineSkillPowerRule(['落雷'], F_STACKS('已入场次数'), ctx => {
  const n = clampInt(ctx.opts.stacks, 0, 99);
  return n > 0 ? { powerAdd: 40 * n, label: '入场' + n + '次→威力+' + (40 * n) } : null;
});

defineSkillPowerRule(['微型斥候'], F_STACKS('受到抵抗技能攻击次数（不含连击）'), ctx => {
  const n = clampInt(ctx.opts.stacks, 0, 99);
  return n > 0 ? { powerAdd: 20 * n, label: '被抵抗' + n + '次→威力+' + (20 * n) } : null;
});

defineSkillPowerRule(['水波术'], F_STACKS('已结束的回合数'), ctx => {
  const n = clampInt(ctx.opts.stacks, 0, 99);
  return n > 0 ? { powerAdd: 20 * n, label: '回合结束' + n + '次→威力+' + (20 * n) } : null;
});

defineSkillPowerRule(['能量刃'], F_STACKS('已应对成功次数'), ctx => {
  const n = clampInt(ctx.opts.stacks, 0, 99);
  return n > 0 ? { powerAdd: 90 * n, label: '应对成功' + n + '次→威力+' + (90 * n) } : null;
});

defineSkillPowerRule(['流星火雨'], F_STACKS('已击败敌方精灵数', 5), ctx => {
  const n = clampInt(ctx.opts.stacks, 0, 5);
  return n > 0 ? { powerAdd: 85 * n, label: '击败' + n + '只→威力+' + (85 * n) } : null;
});

defineSkillPowerRule(['阳火增辉'], F_STACKS('已击败敌方精灵数', 10), ctx => {
  const n = clampInt(ctx.opts.stacks, 0, 10);
  if (n <= 0) return null;
  const m = Math.pow(2, n);
  return { powerMult: m, label: '击败' + n + '只→威力×' + m + '（永久翻倍）' };
});

defineSkillPowerRule(['远行'], F_STACKS('先于敌方行动次数'), ctx => {
  const n = clampInt(ctx.opts.stacks, 0, 99);
  return n > 0 ? { powerAdd: 25 * n, label: '先手' + n + '次→威力+' + (25 * n) } : null;
});

// 绵里藏针：上回合未使用攻击技能 → 本技能威力永久 +20，可叠加次数
defineSkillPowerRule(['绵里藏针'], F_STACKS('未使用攻击技能的次数'), ctx => {
  const n = clampInt(ctx.opts.stacks, 0, 99);
  return n > 0 ? { powerAdd: 20 * n, label: '叠加' + n + '次→威力+' + (20 * n) } : null;
});

// ------------------------------------------------------------
// 2) 敌我状态计数：层数 / 能量 / 生命 / 力竭
// ------------------------------------------------------------
defineSkillPowerRule(['碎冰冰'],
  () => [spNum('freeze', '敌方冻结层数', 0, 0, 10)],
  ctx => {
    const n = clampInt(ctx.opts.freeze, 0, 10);
    return n > 0 ? { powerAdd: 20 * n, label: '敌方冻结' + n + '层→威力+' + (20 * n) } : null;
  });

defineSkillPowerRule(['天体吸积'],
  () => [spNum('marks', '敌方印记层数', 0, 0, 20)],
  ctx => {
    const n = clampInt(ctx.opts.marks, 0, 20);
    return n > 0 ? { powerAdd: 20 * n, label: '敌方印记' + n + '层→威力+' + (20 * n) } : null;
  });

// 鸩毒：每层中毒 +10；应对状态时改为固定 +40
defineSkillPowerRule(['鸩毒'],
  () => [F_COUNTERED()[0], spNum('poison', '敌方中毒层数', 0, 0, 10)],
  ctx => {
    if (ctx.opts.countered) return { powerAdd: 40, label: '应对状态→威力+40' };
    const n = clampInt(ctx.opts.poison, 0, 10);
    return n > 0 ? { powerAdd: 10 * n, label: '敌方中毒' + n + '层→威力+' + (10 * n) } : null;
  });

defineSkillPowerRule(['牵连'],
  () => [spNum('foeFainted', '敌方已力竭精灵数', 0, 0, 5)],
  ctx => {
    const n = clampInt(ctx.opts.foeFainted, 0, 5);
    return n > 0 ? { powerAdd: 30 * n, label: '敌方力竭' + n + '只→威力+' + (30 * n) } : null;
  });

// 坟场搏击：敌方每 1 能量 → 威力 -10%
defineSkillPowerRule(['坟场搏击'],
  () => [spNum('foeEnergy', '敌方当前能量', 0, 0, 10)],
  ctx => {
    const n = clampInt(ctx.opts.foeEnergy, 0, 10);
    return n > 0 ? { powerPct: -0.1 * n, label: '敌方' + n + '能量→威力-' + (10 * n) + '%' } : null;
  });

// 血契：自身每失去 10% 生命 → 威力 +15
defineSkillPowerRule(['血契'],
  () => [spNum('hpLost10', '自身已失去生命（每10%）', 0, 0, 10)],
  ctx => {
    const n = clampInt(ctx.opts.hpLost10, 0, 10);
    return n > 0 ? { powerAdd: 15 * n, label: '自身失去' + (n * 10) + '%生命→威力+' + (15 * n) } : null;
  });

// 燃尽：敌方每失去 5% 生命 → 威力 -5
defineSkillPowerRule(['燃尽'],
  () => [spNum('foeHpLost5', '敌方已失去生命（每5%）', 0, 0, 20)],
  ctx => {
    const n = clampInt(ctx.opts.foeHpLost5, 0, 20);
    return n > 0 ? { powerAdd: -5 * n, label: '敌方失去' + (n * 5) + '%生命→威力-' + (5 * n) } : null;
  });

// 六自由度：威力额外增加「两侧技能威力差」的四分之一（FULL 可由 util 直接取邻槽）
defineSkillPowerRule(['六自由度'],
  () => [spNum('leftPower', '左侧技能威力', 0, 0, 999), spNum('rightPower', '右侧技能威力', 0, 0, 999)],
  ctx => {
    const { l, r } = resolveSidePowers(ctx);
    if (l === 0 && r === 0) return null;
    const add = Math.round(Math.abs(l - r) / 4);
    return add > 0 ? { powerAdd: add, label: '两侧威力差|' + l + '-' + r + '|÷4→威力+' + add } : null;
  });

// ------------------------------------------------------------
// 3) 减益 / 萌化 / 印记等开关类
// ------------------------------------------------------------
defineSkillPowerRule(['急中生智'],
  () => [spCk('selfDebuff', '自身有减益', false)],
  ctx => ctx.opts.selfDebuff ? { powerAdd: 40, label: '自身有减益→威力+40' } : null);

defineSkillPowerRule(['破罐破摔'],
  () => [spCk('selfDebuff', '自身有减益', false)],
  ctx => ctx.opts.selfDebuff ? { powerAdd: 60, label: '自身有减益→威力+60' } : null);

defineSkillPowerRule(['超级糖果'],
  () => [spCk('selfMoe', '自身获得萌化（本次技能生效）', false)],
  ctx => ctx.opts.selfMoe ? { powerAdd: 60, label: '获得萌化→本次威力+60' } : null);

defineSkillPowerRule(['拆礼物'],
  () => [spCk('foeMoe', '敌方有萌化', false)],
  ctx => ctx.opts.foeMoe ? { powerAdd: 100, label: '敌方有萌化→威力+100' } : null);

defineSkillPowerRule(['极寒领域'],
  () => [spCk('foeFrozen', '敌方有冻结', false)],
  ctx => ctx.opts.foeFrozen ? { powerAdd: 60, label: '敌方有冻结→威力+60' } : null);

defineSkillPowerRule(['星痕'],
  () => [spCk('foeMarked', '敌方有印记', false)],
  ctx => ctx.opts.foeMarked ? { powerAdd: 40, label: '敌方有印记→威力+40' } : null);

defineSkillPowerRule(['雪原狩猎'],
  () => [spCk('blizzard', '天气为暴风雪', false)],
  ctx => ctx.opts.blizzard ? { powerAdd: 50, label: '暴风雪天气→威力+50' } : null);

defineSkillPowerRule(['扇风'],
  () => [spCk('firstMove', '本回合先于敌方行动', false)],
  ctx => ctx.opts.firstMove ? { powerPct: 0.5, label: '先于敌方→威力+50%' } : null);

// ------------------------------------------------------------
// 4) 迸发（burst）开关与种类数
// ------------------------------------------------------------
defineSkillPowerRule(['电弧'],
  () => [spCk('burst', '触发迸发', false)],
  ctx => ctx.opts.burst ? { powerAdd: 40, label: '迸发→威力+40' } : null);

defineSkillPowerRule(['引雷'],
  () => [spCk('burst', '触发迸发', false)],
  ctx => ctx.opts.burst ? { powerAdd: 20, label: '迸发→威力+20' } : null);

defineSkillPowerRule(['天旋地转'],
  () => [spCk('burst', '触发迸发', false)],
  ctx => ctx.opts.burst ? { powerAdd: 30, label: '迸发→威力+30（另：先手+1）' } : null);

// 雷暴：每生效 1 种迸发 → 威力 +10（同时能耗 +1，不影响伤害）
defineSkillPowerRule(['雷暴'],
  () => [spNum('burstKinds', '本技能生效过的迸发种类数', 0, 0, 10)],
  ctx => {
    const n = clampInt(ctx.opts.burstKinds, 0, 10);
    return n > 0 ? { powerAdd: 10 * n, label: '迸发' + n + '种→威力+' + (10 * n) + '、能耗+' + n } : null;
  });

// ------------------------------------------------------------
// 5) 能耗变动：本技能能耗每 ±1 → 威力 ±N
// ------------------------------------------------------------
defineSkillPowerRule(['逆袭'],
  () => [spNum('costUp', '本技能能耗增量', 0, 0, 10)],
  ctx => {
    const n = clampInt(ctx.opts.costUp, 0, 10);
    return n > 0 ? { powerAdd: 50 * n, label: '能耗+' + n + '→威力+' + (50 * n) } : null;
  });

defineSkillPowerRule(['涌泉'],
  () => [spNum('costDown', '本技能能耗减少量', 0, 0, 10)],
  ctx => {
    const n = clampInt(ctx.opts.costDown, 0, 10);
    return n > 0 ? { powerAdd: 10 * n, label: '能耗-' + n + '→威力+' + (10 * n) } : null;
  });

defineSkillPowerRule(['叠浪'],
  () => [spNum('costDown', '本技能能耗减少量', 0, 0, 10)],
  ctx => {
    const n = clampInt(ctx.opts.costDown, 0, 10);
    return n > 0 ? { powerAdd: 10 * n, label: '能耗-' + n + '→威力+' + (10 * n) } : null;
  });

// ------------------------------------------------------------
// 6) 「应对状态 → 本次威力翻倍 / +N」（与一期应对类同构）
// ------------------------------------------------------------
const COUNTER_DOUBLE = names => names.forEach(n => {
  defineSkillPowerRule([n], F_COUNTERED, ctx =>
    ctx.opts.countered ? { powerMult: 2, label: '应对状态→本次威力×2' } : null);
});
COUNTER_DOUBLE(['吹炎', '暗突袭', '滚雪球', '炙热波动']);

// 地陷：应对 → 翻倍（并物防+70%，不影响伤害）
defineSkillPowerRule(['地陷'], F_COUNTERED, ctx =>
  ctx.opts.countered ? { powerMult: 2, label: '应对状态→本次威力×2（另：物防+70%）' } : null);

// 灾厄：应对 → 目标从自己改为敌方，且威力 +120
defineSkillPowerRule(['灾厄'], F_COUNTERED, ctx =>
  ctx.opts.countered ? { powerAdd: 120, label: '应对状态→改为打敌方且威力+120' } : null);

// 回旋踢：敌方本回合更换精灵 → 威力翻倍
defineSkillPowerRule(['回旋踢'], F_FOE_SWITCH, ctx =>
  ctx.opts.foeSwitched ? { powerMult: 2, label: '敌方换精灵→本次威力×2' } : null);

// ------------------------------------------------------------
// 7) 「选择：A 或 B」分支类（B 分支若只影响连击/减伤则按约定不实现）
// ------------------------------------------------------------
// 试飞：分支一 每次使用后威力永久 +10（分支二「连击数永久+1」不实现）
defineSkillPowerRule(['试飞'], F_STACKS('每次使用后威力永久+10 的次数'), ctx => {
  const n = clampInt(ctx.opts.stacks, 0, 99);
  return n > 0 ? { powerAdd: 10 * n, label: '已使用' + n + '次→威力+' + (10 * n) } : null;
});

// 友谊满溢：两个分支可同时生效 ——
//   分支一（应对状态）：本次威力 +100%，进乘法段（吃应对倍率的「基础段」）
//   分支二（每次使用后永久 +20）：进加法段，不被 +100% 放大
defineSkillPowerRule(['友谊满溢'],
  () => [...F_COUNTERED(), spNum('stacks', '每次使用后威力永久+20 的次数', 0, 0, 99)],
  ctx => {
    const res = {};
    const labels = [];
    if (ctx.opts.countered) { res.powerPct = 1.0; labels.push('应对状态→本次威力+100%'); }
    const n = clampInt(ctx.opts.stacks, 0, 99);
    if (n > 0) { res.powerAdd = 20 * n; labels.push('已使用' + n + '次→威力+' + (20 * n)); }
    if (labels.length === 0) return null;      // 两个分支都没触发 → 无加成
    res.label = labels.join(' · ');            // 多条说明共用标题行（`.power-mod-notes` 用 · 拼接，可换行）
    return res;
  });


// 驱赶：默认分支 本次威力 +20；应对状态 → +140
defineSkillPowerRule(['驱赶'], F_COUNTERED, ctx =>
  ctx.opts.countered
    ? { powerAdd: 140, label: '应对状态→本次威力+140' }
    : { powerAdd: 20, label: '默认分支→本次威力+20' });

// 轮班：位于 1 号位时威力 +65（另一分支「本回合额外传动1」不影响伤害）
defineSkillPowerRule(['轮班'],
  () => [spCk('pos1', '本技能位于1号位', false)],
  ctx => ctx.opts.pos1 ? { powerAdd: 65, label: '1号位→威力+65' } : null);

// 透镜实验：敌方携带光系技能时威力 +50（另一分支「应对→透射」不影响伤害）
defineSkillPowerRule(['透镜实验'],
  () => [spCk('foeLight', '敌方携带光系技能', false)],
  ctx => ctx.opts.foeLight ? { powerAdd: 50, label: '敌方带光系技能→威力+50' } : null);

// 色散：「对混血精灵造成伤害+50%」
//   「混血」无法从数据判定（SPIRITS 的 a1/a2 是属性而非血统标记），故由用户勾选。
//   伤害 +50% 与威力 ×1.5 在公式里等价（两者都在单次伤害 floor 之前相乘），
//   按本文件约定走 powerPct（进技能威力乘区，与特性威力倍率相加）。
defineSkillPowerRule(['色散'],
  () => [spCk('mixedBlood', '敌方为混血精灵', false)],
  ctx => ctx.opts.mixedBlood ? { powerPct: 0.5, label: '敌方为混血精灵→伤害+50%' } : null);

// ============================================================
// 2026-11 批次：S5 新同步技能
//   「永久 +N」可反复叠加的技能按**次数**展开（同特性层的线性口径，不写成幂）
//   灵扰「偷取能量→连击数永久+1」按约定不实现（连击数一律取 skills.js 的 cb）
// ============================================================
defineSkillPowerRule(['过充电'],
  () => [spCk('charged', '已使用过聚能（至少1次）', false)],
  ctx => ctx.opts.charged ? { powerAdd: 30, label: '聚能后→威力永久+30' } : null);

// 恋恋不舍：每满足 1 次「敌方获得3次减益」的触发，威力永久 +30（按叠加次数线性展开）
defineSkillPowerRule(['恋恋不舍'],
  () => [spNum('stacks', '已叠加次数（每次+30）', 0, 0, 20)],
  ctx => {
    const n = clampInt(ctx.opts.stacks, 0, 20);
    return n > 0 ? { powerAdd: 30 * n, label: '叠加' + n + '次→威力+' + (30 * n) } : null;
  });

// 投毒：每攻击 1 次中毒目标，威力 +25（按次数线性展开）
defineSkillPowerRule(['投毒'],
  () => [spNum('poisonHits', '攻击中毒目标的次数（每次+25）', 0, 0, 20)],
  ctx => {
    const n = clampInt(ctx.opts.poisonHits, 0, 20);
    return n > 0 ? { powerAdd: 25 * n, label: '攻击中毒目标' + n + '次→威力+' + (25 * n) } : null;
  });

// ============================================================
// 查询helper（供 index.html 调用，避免各处重复写判定逻辑）
// ============================================================

// 取技能规则；未注册返回 null
function getSkillPowerRule(skillName) {
  if (!skillName) return null;
  return SKILL_POWER_RULES[skillName] || null;
}

// 该技能是否「有威力变动但规则未实现」—— 供 UI 显式提示，避免静默按 0 处理
function isSkillPowerUnimplemented(skill) {
  if (!skill || !skill.desc) return false;
  if (String(skill.desc).indexOf('威力') < 0) return false;
  return !SKILL_POWER_RULES[skill.n];
}

// 解析技能威力修正（统一入口）
//   返回 { powerSet, powerAdd, powerPct, powerMult, hitsSet, label, implemented, hasRule }
//   powerSet != null：目标威力由调用方写回基础威力输入框，规则的 powerAdd 恒为 0
//   无规则时返回全零 + hasRule:false，由调用方决定是否提示「待补全」
//   天气（ctx.weather）与进攻方印记（ctx.mark）在此统一计入，与技能规则同区相加：
//   雨天 → 水系技能威力 +75%；印记 → 每层按对应百分比提升技能威力
function resolveSkillPower(skill, ctx) {
  // 模式 B 允许覆盖技能属性：天气按「生效属性」判定，其余模式回退技能原始属性。
  // 未选技能时只要仍有生效属性/印记，加成照常生效（此前被 skill && 短路成 0）。
  const effAttr = (ctx && ctx.effectiveAttr) || (skill && skill.a) || '';
  const weatherPct = (ctx && ctx.weather === 'rain' && effAttr === '水') ? 0.75 : 0;
  const mk = (ctx && ctx.mark) ? ctx.mark : null;
  const markPct = mk ? (mk.pct || 0) : 0;
  const extraPct = weatherPct + markPct;
  const extraLabels = [];
  if (weatherPct) extraLabels.push('雨天→水系技能威力+75%');
  // ctx.mark = { pct, label }，label 由 js/01-core.js 的 getMarkInfo 汇总（支持多种印记并存）
  if (markPct) extraLabels.push(mk.label || ('印记→技能威力+' + Math.round(markPct * 100) + '%'));
  const zero = { powerSet: null, powerAdd: 0, powerPct: extraPct, powerMult: 1, hitsSet: null, label: extraLabels.join(' · '), hasRule: false };
  if (!skill) return Object.assign(zero, { unimplemented: false });
  const rule = getSkillPowerRule(skill.n);
  if (!rule) return Object.assign(zero, { unimplemented: isSkillPowerUnimplemented(skill) });

  // opts 缺省补空对象：规则里一律直接读 ctx.opts.x（index.html 始终会传，这里兜底防抛错）
  const full = Object.assign({ opts: {} }, ctx, { skill, skHits: (skill.cb || 1) });
  const r = rule.eff(full) || {};
  return {
    powerSet: (r.powerSet === undefined || r.powerSet === null) ? null : r.powerSet,
    powerAdd: r.powerAdd || 0,
    powerPct: (r.powerPct || 0) + extraPct,
    powerMult: (r.powerMult === undefined || r.powerMult === null) ? 1 : r.powerMult,
    hitsSet: (r.hitsSet === undefined) ? null : r.hitsSet,
    label: [r.label || ''].concat(extraLabels).filter(Boolean).join(' · '),
    implemented: r.implemented !== false,
    hasRule: true,
    unimplemented: false,
  };
}

// 取该技能需要的条件字段（未注册返回空数组）
function getSkillPowerFields(skill) {
  const rule = getSkillPowerRule(skill && skill.n);
  if (!rule || !rule.fields) return [];
  return rule.fields(skill) || [];
}
