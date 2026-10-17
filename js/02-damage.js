// js/02-damage.js — 伤害公式层：computeDamage（唯一实现点）/ collectStatBuffs / applyStatBuff
//                / buildPowerUtil / mergeBuffSourcesList / renderLayersHtml（纯字符串）
// 加载顺序位次 2：依赖 js/01-core.js（diffTableLookup / SPEED_DIFF_TABLE 等）与 data/*.js。
// ⚠️ 本文件禁止出现任何 DOM 引用（verify_formula.js 有断言守着）。
// ================================================================
// 特性「攻防属性加成」收集（stat 通道）
// ================================================================
// 只算「攻方攻击力 + 防方防御力」：
//   · stat 只表达当前精灵自身的攻防被修改，不做跨方联动
//   · 物攻技能只吃 patk / pdef；魔攻技能只吃 matk / mdef（双攻取较高者那一侧）
// 叠加口径：固定点数跨来源相加；**百分比跨来源也相加**（2 个 +20% = +40%，不是 ×1.44）
//
// 返回 { pctSum, pctMult, flatSum, sources: [{label, pct, flat, color}] }
//   pctSum  —— Σ 各来源 pct
//   pctMult —— 1 + pctSum。与 computeDamage 的加成乘区同口径：
//              攻击 = (面板 + Σ固定) × (1 + Σ特性% + (等级倍率 − 1))
//   flatSum —— 各来源 flat 之和
//   sources —— 供 UI 逐项展示来源
// role: 'atk' | 'def' —— 该侧在当前这一击里扮演的角色（默认 'atk'，兼容旧调用）
//   ⚠️ 必须按角色取键：曾经把 patk + pdef（或 matk + mdef）一起收进同一个 bundle，
//      于是「攻方的物防加成」被乘进了攻击层、「防方的魔攻加成」被乘进了防御层 ——
//      宇宙之眼/守护之心这类「防方物防」特性因此在攻方手里凭空放大伤害。
//      stat 通道的语义是「当前精灵自身攻防被修改」，但只有对位那个键才参与本次伤害。
function collectStatBuffs(stat, isPhys, role) {
  const out = { pctSum: 0, pctMult: 1, flatSum: 0, sources: [] };
  if (!stat) return out;
  const isAtkRole = role !== 'def';
  const key = isAtkRole ? (isPhys ? 'patk' : 'matk')   // 攻方只吃自己的攻击键
    : (isPhys ? 'pdef' : 'mdef');                      // 防方只吃自己的防御键
  const v = stat[key];
  if (v) {
    if (v.flat) {
      out.flatSum += v.flat;
      out.sources.push({ key, label: key.toUpperCase(), pct: 0, flat: v.flat });
    }
    if (v.pct) {
      // 百分比累加（不连乘）：多来源与能力等级同处一个加成乘区
      out.pctSum += v.pct;
      out.pctMult = 1 + out.pctSum;
      out.sources.push({ key, label: key.toUpperCase(), pct: v.pct, flat: 0 });
    }
  }
  return out;
}

// 把 stat buff 应用到面板值：attackValue = (面板 + 固定点数) × (1 + Σ百分比加成)
function applyStatBuff(baseVal, buffs) {
  return (baseVal + (buffs ? buffs.flatSum : 0)) * (buffs ? buffs.pctMult : 1);
}

// 特性 stat 通道的语义说明（用于 UI「攻防属性加成」区分项显示）
const STAT_LABELS = { patk: '物攻', matk: '魔攻', pdef: '物防', mdef: '魔防', spd: '速度' };

// ================================================================
// computeDamage —— A / B / FULL 三模式唯一的伤害公式实现
// ================================================================
// 严格遵循「先加减、后乘除」。四层结构：
//
//   攻击层 attackValue  = (面板攻击 + Σ固定加成) × (1 + Σ特性百分比加成 + (能力等级倍率 − 1))
//   防御层 defenseValue = (面板防御 + Σ固定加成) × (1 + Σ特性百分比加成 + (能力等级倍率 − 1))
//   威力层 powerFinal   = (基础威力区 + 固定威力提升区) × 技能威力乘区
//      基础威力区       = 技能威力 × 应对倍率（「应对成功威力×N」「威力翻倍」这类描述）
//      固定威力提升区   = 技能威力加成 + 特性威力加成（求和）
//      技能威力乘区     = 1 + Σ（技能威力+N% 与 特性威力倍率 的增量，求和）
//   结算层 单次伤害 = floor( attackValue / defenseValue × 37/41
//                          × powerFinal × 克制 × 本系 × 特性乘算 × 额外倍率 × 减伤 )
//         总伤害   = 单次伤害 × 连击数
//
// ⚠️ 模式 A（威力按游戏内显示值输入）走同一条路径：传 useLevel:false /
//    typeEff:1 / stab:1 / 无特性 buff，即可精确复现原有语义。
// ⚠️ calc() 与 calcOneFskDmg() 都只能调用本函数，本函数之外不得出现连乘公式字面量。
function computeDamage(o) {
  // ── 攻击层 ──
  //   ⚠️ 百分比加成（特性/道具等）与「能力等级倍率」同处一个加成乘区 —— **相加**，不是相乘：
  //      攻击 = (面板攻击 + Σ固定点数) × (1 + Σ百分比加成 + (能力等级倍率 − 1))
  //      例：246 ×（1 + 0.40 + 1.00）= 590.4，而不是 246 × 1.40 × 2.00 = 688.8
  //      （等级 +10 → 等级倍率 2.0，对加成的贡献是增量 +1.00）
  const atkFlat = o.atkFlat || 0;
  const atkPctMult = o.atkPctMult || 1;
  const atkLevelMult = o.useLevel === false ? 1 : (o.atkLevelMult || 1);
  const atkPctBonus = atkPctMult - 1;        // 百分比加成（如特性物攻 +40% → 0.4）
  const atkLevelBonus = atkLevelMult - 1;    // 能力等级增量（等级+10 → +1.0）
  const attackValue = (o.atkBase + atkFlat) * (1 + atkPctBonus + atkLevelBonus);

  // ── 防御层 —— 同一口径 ──
  const defFlat = o.defFlat || 0;
  const defPctMult = o.defPctMult || 1;
  const defLevelMult = o.useLevel === false ? 1 : (o.defLevelMult || 1);
  const defPctBonus = defPctMult - 1;
  const defLevelBonus = defLevelMult - 1;
  const defenseValue = (o.defBase + defFlat) * (1 + defPctBonus + defLevelBonus);

  // ── 威力层 ──
  //   ⚠️ 三区口径（用户定义，勿改）：
  //     1) 基础威力区   = 技能威力 × 应对倍率 —— 应对倍率只放大基础威力，
  //        不放大「加上去的威力」（固定威力提升区）
  //     2) 固定威力提升区 = 技能威力加成 + 特性威力加成，两者**求和**
  //     3) 技能威力乘区   = 1 + Σ（技能威力+N% 的 N% + 特性威力倍率的增量），
  //        跨来源**相加**而不是连乘；对「基础威力区 + 固定威力提升区」整体生效
  //     例：75 基础、技能威力+50%、特性威力倍率 1.50 → (75 + 0) × (1 + 0.5 + 0.5) = 150
  const powerSkill   = o.powerBase || 0;                            // 技能威力（基础威力）
  const powerCounter = (o.powerMult === undefined || o.powerMult === null) ? 1 : o.powerMult;  // 应对倍率（技能侧）
  const powerTraitM  = (o.powerTraitMult === undefined || o.powerTraitMult === null) ? 1 : o.powerTraitMult; // 特性威力倍率
  const powerPct     = o.powerPct || 0;                             // 本次威力 +N%（技能侧百分比修正）
  const powerAdd     = o.powerAdd || 0;                             // 技能威力加成
  const powerTraitAdd = o.powerTraitBonus || 0;                     // 特性威力加成
  const powerBaseSeg = powerSkill * powerCounter;                   // 基础威力区（只吃应对倍率）
  const powerFlatAll = powerAdd + powerTraitAdd;                    // 固定威力提升区（技能与特性求和）
  const powerPctSum  = powerPct + (powerTraitM - 1);                // 技能威力乘区的增量总和
  const powerMultAll = 1 + powerPctSum;                             // 技能威力乘区
  const powerFinal = (powerBaseSeg + powerFlatAll) * powerMultAll;

  // ── 结算层 ──
  const typeEff = (o.typeEff === undefined || o.typeEff === null) ? 1 : o.typeEff;
  const stab = (o.stab === undefined || o.stab === null) ? 1 : o.stab;
  const traitMult = o.traitMult || 1;              // 攻方特性 × 防方特性（纯乘算残留通道）
  const extraMult = o.extraMult || 1;
  const reduceMult = o.reduceMult === undefined ? 1 : o.reduceMult;
  const hits = Math.max(1, o.hits || 1);

  const ratio = defenseValue > 0 ? attackValue / defenseValue : 0;
  const single = ratio * (37 / 41) * powerFinal * typeEff * stab * traitMult * extraMult * reduceMult;
  const dmg = Math.floor(single) * hits;

  return {
    attackValue, defenseValue, ratio,
    atkPctBonus, atkLevelBonus, defPctBonus, defLevelBonus,
    powerSkill, powerBaseSeg, powerCounter, powerTraitM, powerPct, powerPctSum, powerMultAll,
    powerAdd, powerTraitAdd, powerFlatAll, powerFinal,
    // 兼容旧字段名：固定威力提升区 == 旧「加成段」
    powerBonusAll: powerFlatAll,
    singleDmg: single, dmg, hits,
    typeEff, stab, traitMult, extraMult, reduceMult,
  };
}

// 组装 computeDamage 需要的 util：查表函数 + 面板值（FULL 模式技能侧威力/能耗等）
// 技能规则表（data/skillMult.js）不碰 DOM，全部通过这里注入
function buildPowerUtil(opt) {
  opt = opt || {};
  return {
    diffTableLookup: diffTableLookup,
    speedDiffTable: SPEED_DIFF_TABLE,
    pdefDiffTable: PDEF_DIFF_TABLE,
    manaBurstTable: MANA_BURST_TABLE,
    spdAtk: opt.spdAtk || 0,
    spdDef: opt.spdDef || 0,
    pdefAtk: opt.pdefAtk || 0,
    pdefDef: opt.pdefDef || 0,
    // 敌方（对手）技能槽总能耗
    foeTotalCost: () => (typeof opt.foeCost === 'function' ? opt.foeCost() : 0),
    // 本方左右邻槽威力（钢钻等「两侧技能」公式型用）
    sidePower: (ctx, side) => {
      if (typeof opt.sidePower === 'function') return opt.sidePower(ctx, side);
      return 0;
    },
  };
}

// ================================================================
// 四层拆解渲染（攻击层 / 防御层 / 威力层 / 结算层）
// ================================================================
// 攻橙防蓝：攻击侧用 var(--atk-color)，防御侧用 #42a5f5
// 每个乘算/加算项都标注来源（特性名 / 技能规则 label），便于追溯
// 合并「规则算出的 stat 来源」与「界面手动输入的倍率/固定值」为统一来源列表（供calc / calcOneFskDmg 共用）
// finalPctMult 是最终生效的攻击/防御倍率（含界面覆盖），与规则值之差额即手动增量
// 合并「规则算出的 stat 来源」与「界面手动输入的倍率/固定值」为统一来源列表（供calc / calcOneFskDmg 共用）
// finalPctMult 是最终生效的攻击/防御倍率（含界面覆盖），与规则值之差额即手动增量
function mergeBuffSourcesList(buffs) {
  // 只输出规则表声明的来源。不为「手动覆盖」合成额外行——那会显示成
  // 「手动 ×1.06」这类由除法反推出来的噪音值，对理解结果毫无帮助。
  // 手动覆盖后的最终数值由「＝ 物攻终值」那一行如实体现。
  return (buffs && buffs.sources) ? buffs.sources.slice() : [];
}

function renderLayersHtml(o) {
  const res = o.res;
  if (!res) return '';
  const isB = o.mode === 'B';
  const grp = (title, tagCls, inner) =>
    `<div class="breakdown-group"><div class="breakdown-group-title ${tagCls}">${title}</div>${inner}</div>`;
  const item = (label, val, cls, style) =>
    `<div class="breakdown-item"><span class="bi-label">${label}</span><span class="bi-val ${cls || ''}"${style ? ' style="' + style + '"' : ''}>${val}</span></div>`;

  // ── 攻防层：基础面板值 → 各项加成明细 → 终值 ──
  // levelName/levelSuffix 形如 「攻击能力等级」/「（等级+2）」，仅当倍率≠1 时展开一行
  // effPct/effFlat：该层最终生效的百分比倍率与固定点数（含特性面板的手动覆盖）。
  //   与规则算出的合计不一致 => 用户手动改过输入框，此时输入框是权威值（整体替代规则值），
  //   必须显示生效值，否则明细行与终值对不上。
  // traitTag：该层「特性来源」的名称前缀——攻击层『特性攻击』/ 防御层『特性防御』。
  // ⚠️ 百分比与能力等级同乘区相加（见 computeDamage）：明细行一律显示 **加成百分比**，
  //   如「特性攻击倍率 +40%」「攻击能力等级（等级+10）+100%」，
  //   终值 = 基础 ×（1 + Σ百分比），而不是把几行相乘。
  const pctStr = v => (v > 0 ? '+' : '') + (Math.round(v * 1000) / 10).toString().replace(/\.0$/, '') + '%';
  const sideChain = (baseLabel, baseVal, finalVal, buffs, lvMult, lvLabel, lvSuffix, color, effPct, effFlat, traitTag) => {
    let r = '';
    const srcs = buffs.sources || [];
    // 与 collectStatBuffs / computeDamage 同口径：百分比跨来源相加
    const rulePct  = 1 + srcs.reduce((a, s) => a + (s.pct || 0), 0);
    const ruleFlat = srcs.reduce((a, s) => a + (s.flat || 0), 0);
    const manual = Math.abs((effPct === undefined ? rulePct : effPct) - rulePct) > 1e-9
                || Math.abs((effFlat === undefined ? ruleFlat : effFlat) - ruleFlat) > 1e-9;
    r += item(baseLabel, f1(baseVal), '', color);
    if (manual) {
      const pctV = (effPct === undefined ? rulePct : effPct);
      const flatV = (effFlat === undefined ? ruleFlat : effFlat);
      if (flatV !== 0) r += item('　└ ' + traitTag + '（手动覆盖）', (flatV > 0 ? '+' : '') + f1(flatV), '', color + ';opacity:.85');
      if (pctV !== 1)  r += item('　└ ' + traitTag + '倍率（手动覆盖）', pctStr(pctV - 1), '', color + ';opacity:.85');
    } else {
      srcs.forEach(s => {
        const v = s.flat ? ('+' + s.flat + ' 固定点数') : pctStr(s.pct);
        r += item('　└ ' + (s.flat ? traitTag : traitTag + '倍率'), v, '', color + ';opacity:.85');
      });
    }
    if (isB && lvMult !== 1) r += item('　└ ' + lvLabel + lvSuffix, pctStr(lvMult - 1), '', color + ';opacity:.85');
    r += item('＝ ' + baseLabel + '终值', f1(finalVal), 'highlight', color);
    return r;
  };

  const atkRows = sideChain(
    o.asLabel, o.atkBase, res.attackValue,
    { sources: mergeBuffSourcesList(o.atkBuffs) },
    o.atkMult, '攻击能力等级', o.atkLvSuffix || '', 'color:var(--atk-color)',
    o.atkPctMult, o.atkFlat, '特性攻击');
  const defRows = sideChain(
    o.dsLabel, o.defBase, res.defenseValue,
    { sources: mergeBuffSourcesList(o.defBuffs) },
    o.defMult, '防御能力等级', o.defLvSuffix || '', 'color:#42a5f5',
    o.defPctMult, o.defFlat, '特性防御');

  // ── 威力层 ──
  //   威力 = (基础威力区 + 固定威力提升区) × 技能威力乘区
  //     基础威力区     = 技能威力 × 应对倍率
  //     固定威力提升区 = 技能威力加成 + 特性威力加成（求和）
  //     技能威力乘区   = 1 + Σ（技能威力% + 特性威力倍率增量），对前两者之和整体生效
  const pw = o.pw || {};
  let pwRows = '';
  pwRows += item('技能威力', f1(res.powerSkill), '');
  if (res.powerCounter !== 1) {
    pwRows += item('　应对倍率', '×' + f2(res.powerCounter), '', 'color:#66bb6a');
    pwRows += item('＝ 基础威力区', f1(res.powerBaseSeg), 'highlight');
  }
  if (pw.powerAdd) pwRows += item('＋ 技能威力加成', (pw.powerAdd > 0 ? '+' : '') + f1(pw.powerAdd), '', 'color:#66bb6a');
  if (o.traitPowerShown) pwRows += item('＋ 特性威力加成', '+' + f1(o.traitPowerShown), '', 'color:#a5d6a7');
  if (res.powerFlatAll !== 0) pwRows += item('＝ 固定威力提升区', (res.powerFlatAll > 0 ? '+' : '') + f1(res.powerFlatAll), 'highlight');
  if (res.powerMultAll !== 1) {
    if (res.powerPct) pwRows += item('　└ 技能威力', pctStr(res.powerPct), '', 'color:#66bb6a;opacity:.85');
    if (res.powerTraitM !== 1) pwRows += item('　└ 特性威力倍率', pctStr(res.powerTraitM - 1), '', 'color:#a5d6a7;opacity:.85');
    pwRows += item('＝ 技能威力乘区', '×' + f2(res.powerMultAll), 'highlight');
  }
  pwRows += item('＝ 威力终值', f1(res.powerFinal), 'highlight');

  // ── 结算层 ──
  let stRows = '';
  stRows += item('攻防比 × 37/41', '', '');
  stRows += item('属性克制', o.typeEff === 0 ? '免疫' : '×' + o.typeEff, o.typeEff !== 1 ? 'highlight' : '', 'color:#ff6464');
  if (isB) {
    if (o.stabMult !== 1) stRows += item('本系加成 STAB', '×' + o.stabMult, 'highlight', 'color:#ffd700');
    if (o.atkTraitMult !== 1) stRows += item('攻方特性', '×' + f2(o.atkTraitMult), 'highlight', 'color:#a5d6a7');
    if (o.defTraitMult !== 1) stRows += item('防方特性', '×' + f2(o.defTraitMult), 'highlight', 'color:#90caf9');
  } else if (o.stabMult > 1) {
    stRows += item('本系加成 STAB', '×1.25', 'highlight', 'color:#ffd700');
  }
  if (o.extraMult !== 1) stRows += item('其他倍率', '×' + o.extraMult, 'highlight');
  if (o.reducePct > 0) stRows += item('减伤', '×' + f2(o.reduceMult) + `（-${o.reducePct}%）`, '', 'color:#80e080');
  stRows += item('＝ 单次伤害', f1(res.singleDmg), 'highlight');
  if (o.hits > 1) stRows += item('× 连击', o.hits + ' 次（单次 ' + f1(res.singleDmg) + '）', 'highlight', 'color:#ffca28');
  stRows += item('＝ 最终伤害', f1(o.dmg), 'highlight');

  return grp('⚔️ 攻击层', 'layer-atk', atkRows)
       + grp('🛡️ 防御层', 'layer-def', defRows)
       + grp('✨ 威力层', 'layer-pw', pwRows)
       + grp('🎯 结算层', 'layer-st', stRows);
}
