// ============================================================
// 攻方「特殊特性」规则表
// 原 calcAtkTraitMult 的 atkTr 分支 + getTraitNeedsInput 整理于此
// ============================================================
// 说明：
//   - 一条规则 = 一个特性名（或多个别名共享同一条规则，键与原始 switch case 一致）。
//   - fields(skill)  返回该特性需要用户输入的字段（渲染成复选框/数字框）。
//   - eff(ctx)       返回 { f: 倍率因子, d: 描述文案 }；条件不满足时返回 null（不加成、不显示）。
//                     需要把「威力加法」反映进伤害时，可再返回 powerBonus（整数，
//                     经 calcAtkTraitMult 透传，在 computeDamage 中进入威力基数加法段）。
//   - ctx 由 calcAtkTraitMult 构造：
//       { skAttr, skCost, skKind, atkA1, atkA2, defA1, defA2, def, opts }
//   - 本文件使用真实中文字符（非 \uXXXX 转义），文件编码 UTF-8。
//
// ★ stat 通道（2026 新增）—— 特性直接改攻防属性
//   eff(ctx) 可额外返回以下两个字段（均为可选，向后兼容）：
//
//   stat: { patk:{pct,flat}, matk:{pct,flat}, pdef:{pct,flat}, mdef:{pct,flat}, spd:{pct,flat} }
//     pct  —— 该来源的百分比加成（小数，0.2 = +20%）
//     flat —— 固定点数加成（直接加在面板值上）
//     仅表达「当前这只精灵自身的攻防被修改」。不设 target 字段：伤害公式只依赖
//     「攻方攻击力 + 防方防御力」，防方特性不改变攻方攻击力，反之亦然。
//
//   powerPct: 0.1
//     本次技能威力百分比加成。实现上并入 powerMult（×(1+pct)）。
//     迁移前「变形活画」用 f=1+0.1n 无条件放大全部伤害，现改为正确的威力百分比。
//
//   powerMult: 1.5
//     特性威力倍率（进威力乘法段）。
//     迁移前所有「威力×N」类特性都用 f 表达（f 是伤害总乘算），现改为专门的
//     powerMult 通道，使其在威力层单独可见、可追溯。
//
//   叠加口径：固定点数跨来源相加；百分比跨来源也相加（同特性内部按描述线性展开层数）。
//   侧向生效：物攻技能只吃 patk / pdef；魔攻技能只吃 matk / mdef（由 computeDamage 过滤）。
//
// ★ 侧向归属（谁该在哪张表里）—— 2026 修正
//   两侧的查表路径不同，同一特性放错表会「一半生效、一半丢失」：
//     攻方 → ATK_TRAIT_RULES：采纳 f / powerMult / powerBonus / powerPct / stat
//     防方 → DEF_TRAIT_RULES：只采纳 f 与 stat（防方不参与威力层）
//   因此：
//     · 自身增益类（stat；条件与「自己用哪个技能」无关，如层数/次数/周末）：
//       用 defineBothTraitRule 双侧登记 —— 只登记攻方表时，该精灵当防方会整段丢失。
//     · 纯防御类（只改物防/魔防）：只登记防方表 —— 登记到攻方表只会让它出现在攻方的
//       「攻击层」里（物防被当成攻击加成），历史上「宇宙之眼」即因此被错误计入伤害。
//     · 条件里引用「自己当前使用的技能」（skAttr / skCost / skKind）的规则
//       （挺起胸脯、勇敢、目空、观星、身经百练等）：只能登记攻方表 ——
//       防方侧传入的 skill 是攻方那一击的技能，条件会反。
//       若要覆盖防方场景，就把条件改成用户填写的次数/项数，然后双侧登记
//       （鼓气、三鼓作气、合拍就是这么处理的）。
//     · 反应类减伤（偏振/绝对秩序，f≠1）：只能登记防方表 —— 攻方表里的 f 会直接乘在
//       出场伤害上。
//
// ★ 威力公式（index.html computeDamage 中唯一实现）
//     威力 = (基础威力区 + 固定威力提升区) × 技能威力乘区
//     基础威力区     = 技能威力 × 应对倍率（应对成功威力×N / 威力翻倍 这类描述）
//     固定威力提升区 = 技能威力加成 + 特性威力加成（powerBonus，求和）
//     技能威力乘区   = 1 + Σ（技能威力+N% 与 特性威力倍率 的增量，跨来源相加）
//   ⚠️ 1) 应对倍率只放大基础威力，**不放大**固定威力提升区；
//      2) 特性威力倍率（powerMult，含 powerPct 折算）不再单独乘整段，
//         而是以「倍率 − 1」的增量并入技能威力乘区，与其他百分比来源**相加**。
//
// ★ f 通道迁移记录（避免重复计算 / 归位到正确的层）
//   下列特性原先用 f 表达，已按语义归位：
//     → stat（改攻防属性）：专注力、全神贯注、壮胆、得寸进尺、鼓气、三鼓作气、渗透、
//                           最好的伙伴、助燃、爆燃、蓄电池、超级电池、悲悯、悼亡、
//                           虫群鼓舞、虫群突袭、指挥家、恶魔的晚宴、变形活画(速度项)
//     → powerMult（改威力）：挺起胸脯/“国王”的威严、勇敢、顺风、破空、目空/夺目、涂鸦、
//                           圣火骑士、不移、水翼飞升、天通地明、观星、坠星、冰钻、身经百练、
//                           月光审判、绒粉星光
//   迁移后 f 一律为 1，保留给真正的「伤害总乘算 / 减伤」类规则（如偏振、绝对秩序）。
//
// ★ UI 输入框显隐：TRAIT_CHANNELS（静态通道声明表，见文件末尾）
//   显隐由「规则声明了哪些通道」决定，而非「条件当前是否满足」。
//   例：蒸汽膨胀声明 powerBonus，故即使层数为 0 也只显示「特性威力」，不显示「特性倍率」。
//   新增/修改规则时**必须**同步登记 TRAIT_CHANNELS，否则 UI 会退化为只显示「特性倍率」。
//   查询helper：getTraitChannels(name) / traitChannelsToKinds(ch)
//
// 说明：特性名 / 描述 / 输入标签均为从原始 switch 与 getTraitNeedsInput 原样转译，
//       保留其中原有文案写法（含个别历史笔误），以确保重构前后行为与 UI 一致。
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

// 输入字段构造器：字段 id/type/def/min/max 与 index.html 的 readTraitOptsByMode 一致
const ck = (key, label, def) => ({ id: 'trait-opt-' + key, label, type: 'checkbox', key, def });
const num = (key, label, def, min, max) => ({ id: 'trait-opt-' + key, label, type: 'number', key, def, min, max });

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
// 最好的伙伴：造成克制伤害后，获得攻防速+20% → stat 通道（按层数线性展开）
defineAtkTraitRule(['最好的伙伴'],
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
// 敌方血脉判定类（月光审判 / 绒粉星光，无需用户输入）
// ------------------------------------------------------------
// 月光审判 / 绒粉星光：「威力×2.0」→ powerMult 通道
defineAtkTraitRule(['月光审判'], () => [],
  ctx => (ctx.def && ctx.def.st && ctx.def.st.includes('首领'))
    ? { f: 1, powerMult: 2.0, d: '敌方首领血脉→威力×2.0' } : null);

defineAtkTraitRule(['绒粉星光'], () => [],
  ctx => {
    const st = (ctx.defA1 === ctx.atkA1 || ctx.defA1 === ctx.atkA2 ||
                ctx.defA2 === ctx.atkA1 || ctx.defA2 === ctx.atkA2);
    return (ctx.def && !st) ? { f: 1, powerMult: 2.0, d: '敌非本系血脉→威力×2.0' } : null;
  });

// ------------------------------------------------------------
// 渗透 / 蒸汽膨胀：按己方已使用某类技能的累计次数叠加
//   - 渗透：己方每用1次武系或地系技能，入场时攻防+5%/层（按次数线性展开，走 stat 通道）
//   - 蒸汽膨胀：己方每用1次火系技能，入场时全技能威力+10/层（威力加法，
//     通过 eff 返回的 powerBonus 通道在伤害计算中真正加到威力基数）
// ------------------------------------------------------------
defineAtkTraitRule(['渗透'],
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
// 相同项数由用户填写（系别/类型/能耗，0-3）→ 双侧登记
defineBothTraitRule(['合拍'],
  () => [num('sameCount', '累计相同项数(系别/类型/能耗)', 0, 0, 3)],
  ctx => {
    const n = Math.max(0, Math.min(3, ctx.opts.sameCount || 0));
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

// 裁决 / 滋养 / 点燃 / 净化（4 只迪莫）：造成克制伤害后，获得攻防速+20%
//   「首个技能替换为X系愿力冲击」属技能槽改造，未实现
defineBothTraitRule(['裁决', '滋养', '点燃', '净化'],
  () => [ck('dealtSuper', '已造成克制伤害', false)],
  ctx => ctx.opts.dealtSuper
    ? {
      f: 1, d: '造成克制伤害→攻防速+20%',
      stat: st({ patk: { pct: 0.2 }, matk: { pct: 0.2 }, pdef: { pct: 0.2 }, mdef: { pct: 0.2 }, spd: { pct: 0.2 } }),
    }
    : null);

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
// 显示规则（index.html 的 traitInputKinds）：
//   有 pwM / pwA / atkM / atkA 任一 → 只显示对应输入框，不显示「特性倍率」
//   都没有但有 mult              → 只显示「特性倍率」
//   规则表未登记                 → 只显示「特性倍率」
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
  '裁决': CH_ATKM,
  '滋养': CH_ATKM,
  '点燃': CH_ATKM,
  '净化': CH_ATKM,
  '威慑': CH_ATKM,
  '图书守卫者': CH_ATKM,
  '淬炼火': CH_ATKM,
  '旧玩具': CH_ATKM,
};

// 取某特性声明的通道；未登记返回 null（UI 退化为只显示「特性倍率」）
function getTraitChannels(traitName) {
  if (!traitName) return null;
  const ch = TRAIT_CHANNELS[traitName];
  return ch === undefined ? null : ch;
}

// 按「侧」取通道声明（防方必须与攻方分开，否则会把只影响自身出招的特性显示到防方面板）
//   防方路径 calcDefTraitMult 只采纳 f 与 stat —— 威力层通道（pwM / pwA）在防方永不生效：
//     · 不在 DEF_TRAIT_RULES 里的特性 = 攻方专属（只增强持有者自己出手的技能，
//       如蒸汽膨胀「己方每用1次火系技能→全技能威力+10」），当防方时对来袭伤害毫无作用，
//       防方面板只应显示「特性倍率」（1.0），不能出现「特性威力」并被误当成减伤/威力加成。
//     · 在 DEF_TRAIT_RULES 里的特性：剔除威力层通道，只保留 mult / atkM / atkA；
//       剔完为空则同样退化为「特性倍率」。
function getTraitChannelsForSide(traitName, side) {
  const ch = getTraitChannels(traitName);
  if (side !== 'def') return ch;
  if (!ch) return null;
  if (!DEF_TRAIT_RULES[traitName]) return CH_MULT;
  const defCh = {};
  if (ch.mult) defCh.mult = true;
  if (ch.atkM) defCh.atkM = true;
  if (ch.atkA) defCh.atkA = true;
  return Object.keys(defCh).length ? defCh : CH_MULT;
}

// 通道 → UI 输入框 kind 列表（供index.html 的 traitInputKinds 使用）
//   mult → '特性倍率'（结算层）
//   pwM  → '特性威力倍率'（威力层乘法段）
//   pwA  → '特性威力'（威力层加法段）
//   atkM → '特性攻击倍率' / '特性防御倍率'（攻击层/防御层）
//   atkA → '特性攻击' / '特性防御'（攻击层/防御层）
function traitChannelsToKinds(ch) {
  if (!ch) return ['mult'];
  const kinds = [];
  if (ch.pwM) kinds.push('powerMult');
  if (ch.pwA) kinds.push('powerAdd');
  if (ch.atkM) kinds.push('atkMult');
  if (ch.atkA) kinds.push('atkAdd');
  if (kinds.length === 0) kinds.push('mult');   //含「只有 mult」与「未登记」两种情况
  return kinds;
}

