// ============================================================
// 攻方「特殊特性」规则表
// 原 calcAtkTraitMult 的 atkTr 分支 + getTraitNeedsInput 整理于此
// ============================================================
// 说明：
//   - 一条规则 = 一个特性名（或多个别名共享同一条规则，键与原始 switch case 一致）。
//   - fields(skill)  返回该特性需要用户输入的字段（渲染成复选框/数字框）。
//   - eff(ctx)       返回 { f: 倍率因子, d: 描述文案 }；条件不满足时返回 null（不加成、不显示）。
//                     需要把「威力加法」反映进伤害时，可再返回 powerBonus（整数，
//                     会经 calcAtkTraitMult 透传给 FULL 模式伤害计算对 power 做加法）。
//   - ctx 由 calcAtkTraitMult 构造：
//       { skAttr, skCost, skKind, atkA1, atkA2, defA1, defA2, def, opts }
//   - 本文件使用真实中文字符（非 \uXXXX 转义），文件编码 UTF-8。
//
// 说明：特性名 / 描述 / 输入标签均为从原始 switch 与 getTraitNeedsInput 原样转译，
//       保留其中原有文案写法（含个别历史笔误），以确保重构前后行为与 UI 一致。
// ============================================================

const ATK_TRAIT_RULES = {};

function defineAtkTraitRule(names, fieldsFn, effFn) {
  const rule = { fields: fieldsFn, eff: effFn };
  names.forEach(n => { ATK_TRAIT_RULES[n] = rule; });
}

// 输入字段构造器：字段 id/type/def/min/max 与 index.html 的 readTraitOptsByMode 一致
const ck = (key, label, def) => ({ id: 'trait-opt-' + key, label, type: 'checkbox', key, def });
const num = (key, label, def, min, max) => ({ id: 'trait-opt-' + key, label, type: 'number', key, def, min, max });

// ------------------------------------------------------------
// 能耗类（无需用户输入）
// ------------------------------------------------------------
defineAtkTraitRule(['挺起胸脖', '“国王”的威严'], () => [],
  ctx => ctx.skCost === 1 ? { f: 1.5, d: '能耇01→威力×1.5' } : null);

defineAtkTraitRule(['勇敢'], () => [],
  ctx => ctx.skCost > 3 ? { f: 1.4, d: '能耗>3→威力×1.4' } : null);

defineAtkTraitRule(['鼓气'], () => [],
  ctx => ctx.skCost === 3 && ctx.opts.activated ? { f: 1.2, d: '能老3→攻防×1.2' } : null);

defineAtkTraitRule(['水翅飞升'], () => [],
  ctx => ctx.skCost === 0 ? { f: 1.3, d: '能老0→威力×1.3' } : null);

// ------------------------------------------------------------
// 出手先后类（需勾选：是否先手）
// ------------------------------------------------------------
defineAtkTraitRule(['顺风'], () => [ck('faster', '先手攻击（攻方速度更高）', false)],
  ctx => ctx.opts.faster ? { f: 1.5, d: '先手→威力×1.5' } : null);

defineAtkTraitRule(['破空'], () => [ck('faster', '先手攻击（攻方速度更高）', false)],
  ctx => ctx.opts.faster ? { f: 1.75, d: '先手→威力×1.75' } : null);

// ------------------------------------------------------------
// 技能/自身属性判定类
// ------------------------------------------------------------
defineAtkTraitRule(['目空', '夺目'], () => [],
  ctx => ctx.skAttr && ctx.skAttr !== '光' ? { f: 1.25, d: '非光系→威力×1.25' } : null);

defineAtkTraitRule(['涂鸦'], () => [],
  ctx => ctx.skAttr && ctx.skAttr !== ctx.atkA1 && ctx.skAttr !== ctx.atkA2
    ? { f: 1.5, d: '非本系→威力×1.5' } : null);

defineAtkTraitRule(['不移'], () => [],
  ctx => ctx.opts.noEffect !== false ? { f: 1.3, d: '无额外效果→威力×1.3' } : null);

// ------------------------------------------------------------
// “激活”开关类（需勾选）
// ------------------------------------------------------------
defineAtkTraitRule(['圣火骑士'], () => [ck('activated', '条件已触发', false)],
  ctx => ctx.opts.activated ? { f: 2.0, d: '应对成功后→威力×2.0' } : null);

defineAtkTraitRule(['最好的伙伴'], () => [ck('activated', '条件已触发', false)],
  ctx => ctx.opts.activated ? { f: 1.2, d: '克制触发后→攻防速×1.2' } : null);

defineAtkTraitRule(['专注力'], () => [ck('activated', '特性激活（首回合）', true)],
  ctx => ctx.opts.activated ? { f: 2.0, d: '入场首回合→物攻×2.0' } : null);

// 助燃 / 爆燃：己方每用1次火系技能，双攻分别 +20%/+30%/层，线性叠加（f=1+0.2N / 1+0.3N，非乘性）
defineAtkTraitRule(['助燃'],
  () => [num('stackCount', '己方已使用火系技能次数', 0, 0, 999)],
  ctx => {
    const n = ctx.opts.stackCount || 0;
    if (n <= 0) return null;
    const m = 1 + 0.2 * n;
    return { f: m, d: '火系技能' + n + '次→双攻+20%×' + n + '（×' + m.toFixed(2) + '）' };
  });

defineAtkTraitRule(['爆燃'],
  () => [num('stackCount', '己方已使用火系技能次数', 0, 0, 999)],
  ctx => {
    const n = ctx.opts.stackCount || 0;
    if (n <= 0) return null;
    const m = 1 + 0.3 * n;
    return { f: m, d: '火系技能' + n + '次→双攻+30%×' + n + '（×' + m.toFixed(2) + '）' };
  });

defineAtkTraitRule(['壮胆'], () => [ck('activated', '队伍存在虫系精灵', true)],
  ctx => ctx.opts.activated ? { f: 1.5, d: '队伍有虫系→双攻×1.5' } : null);

defineAtkTraitRule(['得寸进尺'], () => [ck('rainy', '天气为雨天', false)],
  ctx => ctx.opts.rainy ? { f: 2.0, d: '雨天→双攻×2.0' } : null);

defineAtkTraitRule(['天通地明'], () => [ck('enemyIsPolluted', '敌方是污染血脉', false)],
  ctx => ctx.opts.enemyIsPolluted ? { f: 2.0, d: '敌污染血脉→威力×2.0' } : null);

// ------------------------------------------------------------
// 观星 / 坠星：敌印记层数叠加（需输入层数）
// ------------------------------------------------------------
defineAtkTraitRule(['观星'], () => [num('stackCount', '敌方星陌印记层数(0-20)', 0, 0, 20)],
  ctx => {
    if (ctx.skAttr === '地' && (ctx.opts.stackCount || 0) > 0) {
      const m = 1 + 0.15 * ctx.opts.stackCount;
      return { f: m, d: '观星' + ctx.opts.stackCount + '层→威力×' + m.toFixed(2) };
    }
    return null;
  });

defineAtkTraitRule(['坠星'], () => [num('stackCount', '敌方星陌印记层数(0-20)', 0, 0, 20)],
  ctx => {
    if ((ctx.opts.stackCount || 0) > 0) {
      const m = 1 + 0.15 * ctx.opts.stackCount;
      return { f: m, d: '坠星' + ctx.opts.stackCount + '层→威力×' + m.toFixed(2) };
    }
    return null;
  });

// ------------------------------------------------------------
// 蓄电池 / 超级电池：入场次数叠加
// ------------------------------------------------------------
defineAtkTraitRule(['蓄电池'], () => [num('stackCount', '已入场次数(0-5)', 0, 0, 5)],
  ctx => {
    if ((ctx.opts.stackCount || 0) > 0) {
      const m = 1 + 0.2 * ctx.opts.stackCount;
      return { f: m, d: '蓄电池入场' + ctx.opts.stackCount + '次→双攻×' + m.toFixed(2) };
    }
    return null;
  });

defineAtkTraitRule(['超级电池'], () => [num('stackCount', '已入场次数(0-5)', 0, 0, 5)],
  ctx => {
    if ((ctx.opts.stackCount || 0) > 0) {
      const m = 1 + 0.3 * ctx.opts.stackCount;
      return { f: m, d: '超级电池' + ctx.opts.stackCount + '次→双攻×' + m.toFixed(2) };
    }
    return null;
  });

// ------------------------------------------------------------
// 冰钻 / 变形活画：敌方能量、增益（特殊 key）
// ------------------------------------------------------------
defineAtkTraitRule(['冰钻'], () => [num('enemyTotalCost', '敌方携带技能总能耗', 0, 0, 20)],
  ctx => {
    if ((ctx.opts.enemyTotalCost || 0) > 0) {
      const m = 1 + 0.1 * ctx.opts.enemyTotalCost;
      return { f: m, d: '冰钻(敌总能耗' + ctx.opts.enemyTotalCost + ')→威力×' + m.toFixed(2) };
    }
    return null;
  });

defineAtkTraitRule(['变形活画', '画间沉鐵兽'], () => [num('enemyBuff', '敌方当前增益层数', 0, 0, 20)],
  ctx => {
    if ((ctx.opts.enemyBuff || 0) > 0) {
      const m = 1 + 0.1 * ctx.opts.enemyBuff;
      return { f: m, d: '敌' + ctx.opts.enemyBuff + '层增益→威力×' + m.toFixed(2) };
    }
    return null;
  });

// ------------------------------------------------------------
// 悔悯 / 悝亡：己方力竭精灵数叠加
// ------------------------------------------------------------
defineAtkTraitRule(['悔悯'], () => [num('stackCount', '力竭精灵数量(0-5)', 0, 0, 5)],
  ctx => {
    if ((ctx.opts.stackCount || 0) > 0) {
      const m = 1 + 0.3 * ctx.opts.stackCount;
      return { f: m, d: ctx.opts.stackCount + '只力竭→双攻×' + m.toFixed(2) };
    }
    return null;
  });

defineAtkTraitRule(['悝亡'], () => [num('stackCount', '力竭精灵数量(0-5)', 0, 0, 5)],
  ctx => {
    if ((ctx.opts.stackCount || 0) > 0) {
      const m = 1 + 0.3 * ctx.opts.stackCount;
      return { f: m, d: ctx.opts.stackCount + '只力竭→双攻×' + m.toFixed(2) };
    }
    return null;
  });

// ------------------------------------------------------------
// 虫群鼓舞 / 虫群突袭：己方其他虫系精灵数叠加
// ------------------------------------------------------------
defineAtkTraitRule(['虫群鼓舞'], () => [num('stackCount', '队伍中其他虫系精灵数(0-5)', 0, 0, 5)],
  ctx => {
    if ((ctx.opts.stackCount || 0) > 0) {
      const m = 1 + 0.1 * ctx.opts.stackCount;
      return { f: m, d: ctx.opts.stackCount + '只虫系→攻防速×' + m.toFixed(2) };
    }
    return null;
  });

defineAtkTraitRule(['虫群突袭'], () => [num('stackCount', '队伍中其他虫系精灵数(0-5)', 0, 0, 5)],
  ctx => {
    if ((ctx.opts.stackCount || 0) > 0) {
      const m = 1 + 0.15 * ctx.opts.stackCount;
      return { f: m, d: ctx.opts.stackCount + '只虫系→攻防速×' + m.toFixed(2) };
    }
    return null;
  });

// ------------------------------------------------------------
// 指挥家 / 三鼓作气 / 身经百练：累积次数叠加
// ------------------------------------------------------------
defineAtkTraitRule(['指挥家'], () => [num('stackCount', '已累积触发次数', 0, 0, 10)],
  ctx => {
    if ((ctx.opts.stackCount || 0) > 0) {
      const m = 1 + 0.2 * ctx.opts.stackCount;
      return { f: m, d: '应对' + ctx.opts.stackCount + '次→双攻×' + m.toFixed(2) };
    }
    return null;
  });

defineAtkTraitRule(['三鼓作气'], () => [num('stackCount', '已累积触发次数', 0, 0, 10)],
  ctx => {
    if (ctx.skCost === 3 && (ctx.opts.stackCount || 0) > 0) {
      const m = 1 + 0.2 * ctx.opts.stackCount;
      return { f: m, d: '三鼓' + ctx.opts.stackCount + '次→攻防×' + m.toFixed(2) };
    }
    return null;
  });

defineAtkTraitRule(['身经百练'],
  skill => ((skill && (skill.a === '水' || skill.a === '武')) ? [num('stackCount', '已方应对成功次数', 0, 0, 10)] : []),
  ctx => {
    if ((ctx.opts.stackCount || 0) > 0 && (ctx.skAttr === '水' || ctx.skAttr === '武')) {
      const m = 1 + 0.2 * ctx.opts.stackCount;
      return { f: m, d: '应对' + ctx.opts.stackCount + '次→水/武威力×' + m.toFixed(2) };
    }
    return null;
  });

// ------------------------------------------------------------
// 恶魔的晚宴：本场击败数叠加
// ------------------------------------------------------------
defineAtkTraitRule(['恶魔的晚宴'], () => [num('stackCount', '本场已击败敌方精灵数(0-5)', 0, 0, 5)],
  ctx => {
    if ((ctx.opts.stackCount || 0) > 0) {
      const m = 1 + 0.5 * ctx.opts.stackCount;
      return { f: m, d: '击败' + ctx.opts.stackCount + '只→双攻×' + m.toFixed(2) };
    }
    return null;
  });

// ------------------------------------------------------------
// 全神贯注：激活开关 + 已行动次数
// ------------------------------------------------------------
defineAtkTraitRule(['全神贯注'],
  () => [ck('activated', '特性激活（首回合）', true), num('stackCount', '已行动次数(0-5)', 0, 0, 5)],
  ctx => {
    if (!ctx.opts.activated) return null;
    const n = Math.max(0, Math.min(5, ctx.opts.stackCount || 0));
    const r = 1.0 + (5 - n) * 0.2;
    return { f: r, d: '全神贯注(已行动' + n + '次)→物攻×' + r.toFixed(2) };
  });

// ------------------------------------------------------------
// 敌方血脉判定类（月光审判 / 绒粉星光，无需用户输入）
// ------------------------------------------------------------
defineAtkTraitRule(['月光审判'], () => [],
  ctx => (ctx.def && ctx.def.st && ctx.def.st.includes('首领'))
    ? { f: 2.0, d: '敌方首领血脉→威力×2.0' } : null);

defineAtkTraitRule(['绒粉星光'], () => [],
  ctx => {
    const st = (ctx.defA1 === ctx.atkA1 || ctx.defA1 === ctx.atkA2 ||
                ctx.defA2 === ctx.atkA1 || ctx.defA2 === ctx.atkA2);
    return (ctx.def && !st) ? { f: 2.0, d: '敌非本系血脉→威力×2.0' } : null;
  });

// ------------------------------------------------------------
// 渗透 / 蒸汽膨胀：按己方已使用某类技能的累计次数叠加
//   - 渗透：己方每用1次武系或地系技能，入场时攻防+5%/层，线性叠加（f=1+0.05N，非乘性）
//   - 蒸汽膨胀：己方每用1次火系技能，入场时全技能威力+10/层（威力加法，
//     通过 eff 返回的 powerBonus 通道在 FULL 模式伤害计算中真正加到威力）
// ------------------------------------------------------------
defineAtkTraitRule(['渗透'],
  () => [num('stackCount', '己方已使用武系或地系技能次数', 0, 0, 999)],
  ctx => {
    const n = ctx.opts.stackCount || 0;
    if (n <= 0) return null;
    const m = 1 + 0.05 * n;
    return { f: m, d: '武/地技能' + n + '次→攻防+5%×' + n + '（×' + m.toFixed(2) + '）' };
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

const DEF_TRAIT_RULES = {};

function defineDefTraitRule(names, fieldsFn, effFn) {
  const rule = { fields: fieldsFn, eff: effFn };
  names.forEach(n => { DEF_TRAIT_RULES[n] = rule; });
}

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
