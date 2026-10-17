// js/03-trait.js — 特性层：倍率计算（calcAtkTraitMult / calcDefTraitMult）+ 面板 UI（显隐 / 条件框 / 输入读写）
// 加载顺序位次 3：依赖 js/01-core（state）/ js/02-damage（collectStatBuffs）与 data/traitMult.js 规则表。
// 边界：本文件只通过 traitInputId(kind, mode, side) / trait-opt-* 读写 DOM，不做布局；卡片级交互归 js/05+。
// 运行时前向引用（合法）：calc / calcFull / switchMode / recalcStats 仍在 index.html 行内脚本，调用期才解析。
// ============================================================
// TRAIT MULTIPLIER AUTO-CALC  特性倍率自动计算 v3.0
// ============================================================
// ================================================================
// 攻方特性倍率计算（仅计算攻方 atkTr 的加成）
// ================================================================

// 计算防御方技能槽总能耗（用于冰钻特性自动计算）
function calcDefTotalCost(defSpirit) {
  if (!defSpirit || typeof fullState === 'undefined') return 0;
  const side = defSpirit === state.def ? 'def' : 'atk';
  const slots = fullState[side];
  if (!slots) return 0;
  let total = 0;
  slots.forEach(slot => {
    if (slot && slot.skill && slot.skill.c !== undefined) {
      total += (slot.skill.c || 0);
    }
  });
  return total;
}

function calcAtkTraitMult(atk, def, skill, opts) {
  opts = opts || {};
  const atkTr = atk ? atk.tr : null;
  if (skill && skill.k === '\u72b6\u6001') return { mult:1, desc:'\u72b6\u6001\u6280\u80fd\u65e0\u4f24\u5bb3', needsInput:[] };
  // ⚠️ skill 允许为 null（尚未选技能）：仍按特性规则给出条件字段 + 与技能无关的加成，
  //    使「只选精灵」就能配置特性；依赖技能属性的规则会因 skAttr 为空而自然不生效
  const skAttr = skill ? (skill.a || '') : '';
  const skCost = skill ? (skill.c || 0) : 0;
  const skKind = skill ? (skill.k || '') : '';
  const skName = skill ? (skill.n || '') : '';   // 供「共鸣/齐鸣」等按技能名判定的规则使用
  const atkA1 = atk ? (atk.a1 || '') : '';
  const atkA2 = atk ? (atk.a2 || '') : '';
  const defA1 = def ? (def.a1 || '') : '';
  const defA2 = def ? (def.a2 || '') : '';

  let mult = 1.0;
  const desc = [];
  let powerBonus = 0;      // 特性威力加成（威力公式的加法段）
  let powerMult = 1;       // 特性威力倍率（威力公式的乘法段）
  let powerPct = 0;        // 特性威力百分比（并入威力倍率）
  let stat = null;         // 攻防属性加成 { patk:{pct,flat}, ... }

  // 特殊特性规则已数据化到 data/traitMult.js（ATK_TRAIT_RULES）
  if (atkTr && ATK_TRAIT_RULES[atkTr]) {
    const rule = ATK_TRAIT_RULES[atkTr];
    const eff = rule.eff({ skAttr, skCost, skKind, skName, atkA1, atkA2, defA1, defA2, def, typeEff: skAttr ? getTypeEff(skAttr, defA1, defA2) : 1, opts });
    if (eff) {
      mult *= (eff.f === undefined ? 1 : eff.f);
      if (eff.d) desc.push(eff.d);
      if (eff.powerBonus) powerBonus = eff.powerBonus;  // 蒸汽膨胀等：威力加成
      if (eff.powerMult) powerMult = eff.powerMult;      // 挺起胸脯等：威力倍率
      if (eff.powerPct) powerMult *= (1 + eff.powerPct);// 变形活画等：威力百分比
      if (eff.stat) stat = eff.stat;                    // 专注力等：攻防属性加成
    }
  }

  return {
    mult,
    desc: desc.length>0 ? desc.join('\uff1b') : (atkTr ? '\u7279\u6027\u5bf9\u6b64\u6280\u80fd\u65e0\u76f4\u63a5\u4f24\u5bb3\u52a0\u6210' : '\u65e0\u7279\u6027'),
    needsInput: getTraitNeedsInput(atkTr, null, skill),
    powerBonus,
    powerMult,
    powerPct,
    stat,
  };
}

// ================================================================
// 防方特性倍率计算（仅计算防方 defTr 的减伤）
// ================================================================
function calcDefTraitMult(atk, def, skill, opts) {
  opts = opts || {};
  const defTr = def ? def.tr : null;
  if (skill && skill.k === '\u72b6\u6001') return { mult:1, desc:'\u72b6\u6001\u6280\u80fd\u65e0\u4f24\u5bb3', needsInput:[] };
  // ⚠️ skill 允许为 null（尚未选技能）：防方特性同样给出条件字段，便于先选精灵后配技能
  const skAttr = skill ? (skill.a || '') : '';
  const skCost = skill ? (skill.c || 0) : 0;
  const skKind = skill ? (skill.k || '') : '';
  const skName = skill ? (skill.n || '') : '';
  const atkA1 = atk ? (atk.a1 || '') : '';
  const atkA2 = atk ? (atk.a2 || '') : '';
  const defA1 = def ? (def.a1 || '') : '';
  const defA2 = def ? (def.a2 || '') : '';

  let mult = 1.0;
  const desc = [];
  let stat = null;         // 防方自身的攻防属性加成
  // 本次来袭技能的属性克制系数（防方视角：技能属性 vs 防方自身属性）。
  //   供「受到的克制伤害±N%」类规则使用（如 狂欢开始）；未选技能时为 1。
  const typeEff = skAttr ? getTypeEff(skAttr, defA1, defA2) : 1;

  // 防方特殊特性规则已数据化到 data/traitMult.js（DEF_TRAIT_RULES）
  if (defTr && DEF_TRAIT_RULES[defTr]) {
    const rule = DEF_TRAIT_RULES[defTr];
    // ⚠️ 防方 ctx 也补齐 skCost / skKind / skName / typeEff：防方规则可能需要按「来袭技能」判定
    //    （如 毒牙「只对物攻生效」、狂欢开始「受到的克制伤害+25%」）。字段与攻方 ctx 同名同义。
    const eff = rule.eff({ skAttr, skCost, skKind, skName, atkA1, atkA2, defA1, defA2, def, typeEff, opts });
    if (eff) {
      mult *= (eff.f === undefined ? 1 : eff.f);
      if (eff.d) desc.push(eff.d);
      if (eff.stat) stat = eff.stat;
    }
  }

  return {
    mult,
    // 无加成说明时 desc 置空：UI 只显示特性原始描述，不再输出「特性对此技能无直接减伤」提示
    desc: desc.length>0 ? desc.join('\uff1b') : (defTr ? '' : '\u65e0\u7279\u6027'),
    needsInput: getDefTraitNeedsInput(defTr, skill),
    stat,
  };
}

// 防方特性所需的用户输入
function getDefTraitNeedsInput(defTr, skill) {
  // 防方特殊特性的输入字段已数据化到 data/traitMult.js（DEF_TRAIT_RULES[defTr].fields）
  const rule = defTr ? DEF_TRAIT_RULES[defTr] : null;
  if (rule && rule.fields) return rule.fields(skill);
  return [];
}

// 组合包装（向后兼容）
function checkDefCarriesAttr(defSpirit, attr) {
  if (!defSpirit || !attr) return null;
  // 尝试从完整模式技能槽获取
  if (typeof fullState !== 'undefined') {
    // 判断是攻击方还是防御方
    const side = defSpirit === state.def ? 'def' : 'atk';
    const slots = fullState[side];
    if (slots) {
      for (const slot of slots) {
        if (slot && slot.skill && slot.skill.a === attr) return true;
      }
      // 至少有一个技能被填写了，说明数据可用，返回 false（未携带）
      const hasAny = slots.some(s => s && s.skill);
      if (hasAny) return false;
    }
  }
  // 简单模式或技能槽未填：返回 null（由用户复选框 opts.defCarriesSameAttr 决定）
  return null;
}

function getTraitNeedsInput(atkTr, defTr, skill) {
  // 攻方特殊特性的输入字段已数据化到 data/traitMult.js（ATK_TRAIT_RULES[atkTr].fields）
  const rule = atkTr ? ATK_TRAIT_RULES[atkTr] : null;
  if (rule && rule.fields) return rule.fields(skill);
  return [];
}

// ================================================================
// 更新特性双面板 UI（攻防分离）
// ================================================================
function autoUpdateTraitUI() {
  // Tab2/A: 用 selectedSkillName
  const skillB = state.selectedSkillName ? SKILLS.find(s => s.n === state.selectedSkillName) : null;
  updateTraitPanelForMode('b', skillB);
  // FULL: 优先用选中的攻方技能槽
  let skillFull = skillB;
  if (typeof fullState !== 'undefined') {
    const selIdx = fullState.atkSel >= 0 ? fullState.atkSel : 0;
    for (let i = selIdx; i < 4; i++) {
      if (fullState.atk[i] && fullState.atk[i].skill) { skillFull = fullState.atk[i].skill; break; }
    }
  }
  updateTraitPanelForMode('full', skillFull);
}

// 特性规则提示（如「✨ 火系技能2次→全技能威力+20」）跟在特性名称后同行显示。
//   占位文案（无特性 / 无直接伤害加成）不显示；每次调用重置名称文本以清掉旧提示。
const TRAIT_DESC_PLACEHOLDERS = ['无特性', '特性对此技能无直接伤害加成'];
function renderTraitNameWithNote(nameEl, name, desc, icon) {
  if (!nameEl) return;
  nameEl.textContent = name || '暂无特性';
  if (!desc || TRAIT_DESC_PLACEHOLDERS.indexOf(desc) >= 0) return;
  const note = document.createElement('span');
  note.className = 'trait-name-note';
  note.textContent = `${icon} ${desc}`;
  nameEl.appendChild(note);
}

// 更新某个 mode（'b' 或 'full'）的攻防特性面板
function updateTraitPanelForMode(mode, skill) {
  const atkTr = state.atk ? state.atk.tr : null;
  const defTr = state.def ? state.def.tr : null;

  // ── 攻方面板 ──
  const atkNameEl = document.getElementById(`trait-atk-name-${mode}`);
  const atkDescEl = document.getElementById(`trait-atk-desc-${mode}`);
  const atkMultEl = document.getElementById(mode === 'b' ? 'trait-mult-b' : 'trait-mult-full');
  const atkCondEl = document.getElementById(`trait-atk-cond-${mode}`);

  if (atkNameEl) atkNameEl.textContent = atkTr || '暂无特性';
  if (atkDescEl) atkDescEl.textContent = (state.atk && state.atk.tr_desc) || (atkTr ? '（暂无说明）' : '选择攻击方精灵后自动显示');

  // ── 防方面板 ──
  const defNameEl = document.getElementById(`trait-def-name-${mode}`);
  const defDescEl = document.getElementById(`trait-def-desc-${mode}`);
  const defMultEl = document.getElementById(`trait-def-mult-${mode}`);
  const defCondEl = document.getElementById(`trait-def-cond-${mode}`);

  if (defNameEl) defNameEl.textContent = defTr || '暂无特性';
  if (defDescEl) defDescEl.textContent = (state.def && state.def.tr_desc) || (defTr ? '（暂无说明）' : '选择防御方精灵后自动显示');

  // ⚠️ 不因「尚未选技能」而提前返回：条件输入框与各通道输入框只按 TRAIT_CHANNELS 声明显隐，
  //    与技能无关的规则（如蒸汽膨胀按次数加威力）在只选精灵时就能配置并算出数值
  // 读取当前条件选项，并自动注入可计算的值
  //   ⚠️ 必须**逐侧**读取：条件输入框挂在各自的特性面板上（id: trait-opt-{mode}-{side}-{key}），
  //      无 side 的读取只命中攻方面板 —— 两侧若用同名条件（stackCount 等），防方会读到攻方的值，
  //      并把错误数值回填进防方的「特性防御倍率」输入框（进而污染伤害）。
  const optsAtk = readTraitOptsByMode(mode, 'atk');
  const optsDef = readTraitOptsByMode(mode, 'def');
  // 冰钻特性：自动从防方技能槽累加总能耗（只属于攻方侧规则）
  if (state.atk && state.atk.tr === '冰钻') {
    const autoCost = calcDefTotalCost(state.def);
    if (autoCost > 0) optsAtk.enemyTotalCost = autoCost;
  }
  // 分别计算攻防
  const atkResult = calcAtkTraitMult(state.atk, state.def, skill, optsAtk);
  const defResult = calcDefTraitMult(state.atk, state.def, skill, optsDef);

  // 更新攻方倍率（按规则实际影响动态显隐：结算层倍率 / 威力层 / 攻击层）
  const atkBuffs = collectStatBuffs(atkResult.stat, state.atkStat === 'patk', 'atk');
  updateTraitInputVisibility(mode, 'atk', atkTr, atkResult, atkBuffs);
  if (atkCondEl) renderTraitCond(atkResult.needsInput, atkCondEl, mode, 'atk');
  // 规则提示 → 跟在特性名称后同行；描述栏只留特性原始文本
  renderTraitNameWithNote(atkNameEl, atkTr, atkResult.desc, '✨');
  if (atkDescEl) atkDescEl.textContent = (state.atk && state.atk.tr_desc) || (atkTr ? '（暂无说明）' : '选择攻击方精灵后自动显示');

  // 更新防方倍率（同上，动态显隐）
  const defBuffs = collectStatBuffs(defResult.stat, state.atkStat === 'patk', 'def');
  updateTraitInputVisibility(mode, 'def', defTr, defResult, defBuffs);
  if (defCondEl) renderTraitCond(defResult.needsInput, defCondEl, mode, 'def');
  renderTraitNameWithNote(defNameEl, defTr, defResult.desc, '🛡️');
  if (defDescEl) defDescEl.textContent = (state.def && state.def.tr_desc) || (defTr ? '（暂无说明）' : '选择防御方精灵后自动显示');
}

// ================================================================
// 特性输入框的动态显隐 + 统一读取
// ================================================================
// 规则：
//   · 特性规则表未定义威力/攻击相关 → 只显示「特性倍率」（结算层通用倍率）
//   · 规则定义了威力相关（powerMult / powerBonus / powerPct）→ 显示「特性威力倍率」「特性威力」（威力层）
//   · 规则定义了攻击相关（stat 的pct / flat）→ 显示「特性攻击倍率」「特性攻击」（攻击层）
//   · 防御方面板对称命名为「特性防御倍率」「特性防御」（防御层）
// 可见性由 updateTraitInputVisibility() 依据规则计算结果切换；
// 隐藏的输入框不参与计算（避免与规则值重复叠加），但值保留在 DOM 中不丢失。
// 该侧全部可手动覆盖的输入框 kind（清标记 / 重置共用同一份清单）
const TRAIT_INPUT_KINDS = ['mult', 'powerMult', 'powerAdd', 'atkMult', 'atkAdd'];

function traitInputId(kind, mode, side) {
  const sid = side === 'atk' ? '' : 'def-';
  if (mode === 'b') {
    return {
      mult: `trait-${sid}mult-b`,
      powerMult: `trait-${sid}power-mult-b`,
      powerAdd: `trait-${sid}power-b`,
      atkMult: `trait-${sid}atk-mult-b`,
      atkAdd: `trait-${sid}atk-add-b`,
    }[kind];
  }
  return {
    mult: `trait-${sid}mult-full`,
    powerMult: `trait-${sid}power-mult-full`,
    powerAdd: `trait-${sid}power-full`,
    atkMult: `trait-${sid}atk-mult-full`,
    atkAdd: `trait-${sid}atk-add-full`,
  }[kind];
}

// 依据「静态通道声明」判定该侧需要显示哪些输入
//   ⚠️ 依据规则表声明的通道，而非条件当前是否满足。
//      例：蒸汽膨胀声明了 powerBonus，故即使层数为 0 也只显示「特性威力」。
//   ⚠️ 必须按 side 取通道（getTraitChannelsForSide）：防方面板只显示 DEF_TRAIT_RULES
//      真正会产生的通道。蒸汽膨胀这类「只增强自己出招」的攻方专属特性当防方时，
//      若沿用同一张通道表，防方面板会错误地显示「特性威力」，且该值会被算进攻方伤害。
function traitInputKinds(traitName, side) {
  return traitChannelsToKinds(getTraitChannelsForSide(traitName, side));
}

// ── 条件输入签名缓存（Phase 5）────────────────────────────────────
// updateTraitInputVisibility 每次重算都要序列化该侧全部条件输入作签名；
// readTraitOptsByMode 是 DOM 前缀扫描 + JSON.stringify，4 个面板 × 每次按键不便宜。
// 改为按 (mode, side) 缓存序列化结果，只在条件 DOM 实际变化时失效：
//   onTraitCondChange（用户输入）/ resetTraitInput / resetTraitPanelForSide（恢复默认）/
//   renderTraitCond 真正重写（结构或值变化）—— 即全部写入点。
const _traitOptsCache = {};
const _traitOptsVer = {};
function bumpTraitOptsVersion(mode, side) {
  // ⚠️ 必须同时失效两侧：readTraitOptsByMode 的旧前缀兜底（prefixOld 全量扫描）
  //    会把另一侧的条件输入读进来——实测 readTraitOptsByMode('b','def') 在攻方
  //    有 stackCount 输入时返回 {"atk-stackCount":0}。任一侧 DOM 变化都可能
  //    改变另一侧的序列化结果，按侧独立失效会产生脏签名（曾导致双页比对 DIFFERENT）。
  ['atk', 'def'].forEach(s => {
    const k = mode + '|' + s;
    _traitOptsVer[k] = (_traitOptsVer[k] || 0) + 1;
  });
}
function traitOptsSignature(mode, side) {
  const k = mode + '|' + side;
  const ver = _traitOptsVer[k] || 0;
  if (!_traitOptsCache[k] || _traitOptsCache[k].v !== ver) {
    _traitOptsCache[k] = { v: ver, s: JSON.stringify(readTraitOptsByMode(mode, side)) };
  }
  return _traitOptsCache[k].s;
}

// 更新某一侧输入框的显隐（并把规则算出的值自动填入）
function updateTraitInputVisibility(mode, side, traitName, res, buffs) {
  const kinds = traitInputKinds(traitName, side);
  const row = document.getElementById(`trait-inputs-${mode}-${side}`);
  if (row) {
    row.querySelectorAll('[data-trait-input]').forEach(el => {
      el.style.display = kinds.indexOf(el.getAttribute('data-trait-input')) >= 0 ? '' : 'none';
    });

    // ── 输入源签名：特性名 + 该侧全部条件输入 ──
    // 签名变化 = 规则的数据来源变了（换精灵/ 换技能 / 改条件）→ 手动覆盖作废，
    // 回到条件生成的自动值。签名不变（仅普通重算）→ 保留用户手动填写的值。
    // 例：次数 2 → 1.4，手动改 1.5 生效；再把次数改成 4 → 签名变化 → 恢复 1.8。
    const sig = (traitName || '') + '|' + traitOptsSignature(mode, side);
    if (row.dataset.sig !== sig) {
      row.dataset.sig = sig;
      // ⚠️ 手动标记 data-user-edited 打在 <input> 上，而 [data-trait-input] 在分组 <span> 上，
      //    因此必须按 traitInputId 取输入框清标记；清 span 无效（曾导致手动覆盖永不失效）。
      TRAIT_INPUT_KINDS.forEach(k => {
        const el = document.getElementById(traitInputId(k, mode, side));
        if (el) delete el.dataset.userEdited;
      });
    }
  }
  const auto = {
    mult: (res && res.mult !== undefined) ? res.mult : 1,
    powerMult: (res && res.powerMult) ? res.powerMult : 1,
    powerAdd: (res && res.powerBonus) ? res.powerBonus : 0,
    atkMult: buffs ? buffs.pctMult : 1,
    atkAdd: buffs ? buffs.flatSum : 0,
  };
  kinds.forEach(k => {
    const el = document.getElementById(traitInputId(k, mode, side));
    // 规则浮点值（如 1 + 0.1×7 = 1.7000000000000002）直接赋给 number 输入框会显示一长串尾噪，
    // 这里四舍五入到 4 位小数再回填，既不改计算结果，又能正常显示 1.7 / 1.70。
    if (el && !el.dataset.userEdited) el.value = Math.round((+auto[k] + Number.EPSILON) * 1e4) / 1e4;
  });
}

// 用户手动编辑特性输入框：打标记，后续自动回填跳过本框（实现「手动覆盖规则值」）
function onTraitInputEdit(mode, side, kind) {
  const el = document.getElementById(traitInputId(kind, mode, side));
  if (el) el.dataset.userEdited = '1';
  if (mode === 'b') calc(); else calcFull();
}

// 取该侧特性规则对应的技能对象（条件框默认值需要按fields() 生成）
function traitSkillFor(mode, side) {
  if (mode === 'b') {
    return state.selectedSkillName ? SKILLS.find(s => s.n === state.selectedSkillName) : null;
  }
  const spirit = side === 'atk' ? state.atk : state.def;
  if (!spirit || typeof fullState === 'undefined') return null;
  const slots = fullState[side] || [];
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] && slots[i].skill && slots[i].skill.k !== '状态') return slots[i].skill;
  }
  return null;
}

// 重置特性输入：回到「无加成」基线
//   1) 清掉该侧所有输入框的手动标记
//   2) 条件输入框恢复到规则声明的默认值（次数 → 0，复选框 → 默认勾选态）
//   3) 重跑规则自动回填 —— 此时条件为默认值，倍率自然回到 1.0、加成回到 0
function resetTraitInput(mode, side, kind) {
  // 1) 清除该侧全部输入框的手动标记
  TRAIT_INPUT_KINDS.forEach(k => {
    const e = document.getElementById(traitInputId(k, mode, side));
    if (e) delete e.dataset.userEdited;
  });

  // 2) 条件输入框恢复默认值
  const skill = traitSkillFor(mode, side);
  const trName = side === 'atk' ? (state.atk && state.atk.tr) : (state.def && state.def.tr);
  const table = side === 'atk' ? ATK_TRAIT_RULES : DEF_TRAIT_RULES;
  const rule = trName ? table[trName] : null;
  if (rule && rule.fields && skill) {
    rule.fields(skill).forEach(f => {
      const ce = document.getElementById(`trait-opt-${mode}-${side}-${f.key}`);
      if (!ce) return;
      if (ce.type === 'checkbox') ce.checked = !!f.def;
      else ce.value = (f.def === undefined ? 0 : f.def);
    });
  }
  bumpTraitOptsVersion(mode, side);   // 条件输入恢复默认值 → 签名缓存失效

  // 3) 重跑规则 → 自动回填基线值
  if (mode === 'b') {
    if (skill) updateTraitPanelForMode('b', skill);
    calc();
  } else {
    calcFull();
  }
}

// 切换精灵时重置该侧特性面板：清掉手动覆盖标记、作废签名缓存、把条件输入框恢复规则默认值。
// 否则旧精灵的手动填入值/条件会沿用给新精灵（同名特性时签名不变 → 不清除 → 填写框未重置）；
// 旧精灵编辑过但新精灵隐藏的通道输入框连带其「重置」按钮一并不可见。
function resetTraitPanelForSide(side) {
  ['b', 'full'].forEach(mode => {
    const trName = side === 'atk' ? (state.atk && state.atk.tr) : (state.def && state.def.tr);
    const skill = traitSkillFor(mode, side);
    const table = side === 'atk' ? ATK_TRAIT_RULES : DEF_TRAIT_RULES;
    const rule = trName ? table[trName] : null;
    if (rule && rule.fields && skill) {
      rule.fields(skill).forEach(f => {
        const ce = document.getElementById(`trait-opt-${mode}-${side}-${f.key}`);
        if (!ce) return;
        if (ce.type === 'checkbox') ce.checked = !!f.def;
        else ce.value = (f.def === undefined ? 0 : f.def);
      });
    }
    bumpTraitOptsVersion(mode, side);   // 切精灵重置条件输入 → 签名缓存失效
    TRAIT_INPUT_KINDS.forEach(k => {
      const el = document.getElementById(traitInputId(k, mode, side));
      if (el) delete el.dataset.userEdited;
    });
    const row = document.getElementById(`trait-inputs-${mode}-${side}`);
    if (row) delete row.dataset.sig;
  });
}

// 读取某一侧生效的特性输入值；隐藏的项回退到规则计算值
function readTraitInputs(mode, side, traitName, res, buffs) {
  const kinds = traitInputKinds(traitName, side);
  const rd = (kind, fallback) => {
    if (kinds.indexOf(kind) < 0) return fallback;
    const el = document.getElementById(traitInputId(kind, mode, side));
    if (!el) return fallback;
    const v = parseFloat(el.value);
    return isNaN(v) ? fallback : v;
  };
  return {
    mult: rd('mult', (res && res.mult !== undefined) ? res.mult : 1),
    powerMult: rd('powerMult', (res && res.powerMult) ? res.powerMult : 1),
    powerAdd: rd('powerAdd', (res && res.powerBonus) ? res.powerBonus : 0),
    atkMult: rd('atkMult', buffs ? buffs.pctMult : 1),
    atkAdd: rd('atkAdd', buffs ? buffs.flatSum : 0),
    kinds,
  };
}

// 取某侧特性输入框的「权威值」：用户手动编辑过（且该框当前可见）时用输入框的值，
// 否则回退到规则按当前上下文算出的值。
//   ⚠️ FULL 模式 4 个技能槽的技能属性可能不同（观星/身经百练等威力规则与技能属性相关），
//      而特性输入框只按「首个非状态技能」自动填一次，
//      因此不能无条件采信输入框，只在用户手动覆盖时采信（与模式 B 的手动覆盖语义一致）。
function traitInputEffective(kind, mode, side, ruleVal) {
  const el = document.getElementById(traitInputId(kind, mode, side));
  // ⚠️ 显隐标记在分组 <span data-trait-input> 上，<input> 自身的 style.display 始终为空 ——
  //    只看 input 会把「已隐藏但仍带 data-user-edited」的旧值当成有效手动覆盖（曾导致
  //    防方面板的「特性威力」在隐藏后仍被算进伤害）。故按所属分组判断可见性。
  const group = el && el.closest ? el.closest('[data-trait-input]') : null;
  const visible = group ? group.style.display !== 'none' : (el && el.style.display !== 'none');
  if (el && el.dataset.userEdited && visible) {
    const v = parseFloat(el.value);
    if (!isNaN(v)) return v;
  }
  return ruleVal;
}

// 刷新两侧「攻防属性加成」区
// 必须在条件勾选框已渲染之后调用——因为 readTraitOptsByMode 依赖 DOM 里的勾选框，
// 而 updateTraitPanelForMode 是「先算 stat → 后渲染勾选框」，首次渲染时 stat 必然为空。
// 故 calc()/calcFull() 在算完伤害后需要再刷一次，保证「勾选 → 立即看到加成」与结果栏同步。
function refreshStatAreas(mode, skill) {
  // skill 为 null（尚未选技能）时同样需要这一趟：条件框刚渲染完，需据此重算并回填
  const optsAtk = readTraitOptsByMode(mode, 'atk');
  const optsDef = readTraitOptsByMode(mode, 'def');
  const isPhys = state.atkStat === 'patk';
  const rAtk = calcAtkTraitMult(state.atk, state.def, skill, optsAtk);
  const rDef = calcDefTraitMult(state.atk, state.def, skill, optsDef);
  // 条件勾选框此时已渲染 → 重新判定输入框显隐并回填正确值（与 stat 区保持一致）
  const atkTr = state.atk ? state.atk.tr : null;
  const defTr = state.def ? state.def.tr : null;
  updateTraitInputVisibility(mode, 'atk', atkTr, rAtk, collectStatBuffs(rAtk.stat, isPhys, 'atk'));
  updateTraitInputVisibility(mode, 'def', defTr, rDef, collectStatBuffs(rDef.stat, isPhys, 'def'));
}

// 渲染特性条件选项到指定容器（side: 'atk'|'def'）
function renderTraitCond(fields, container, mode, side) {
  if (!container) return;
  if (!fields || fields.length === 0) { container.innerHTML = ''; delete container.dataset.traitCondSig; return; }

  // 过滤 onlyIfNoAuto
  const skill = state.selectedSkillName ? SKILLS.find(s => s.n === state.selectedSkillName) : null;
  const visibleFields = fields.filter(f => {
    if (!f.onlyIfNoAuto) return true;
    const skAttr = skill ? skill.a : '';
    const autoVal = checkDefCarriesAttr(state.def, skAttr);
    return autoVal === null; // 只有无法自动判断时才显示
  });
  if (visibleFields.length === 0) { container.innerHTML = ''; delete container.dataset.traitCondSig; return; }

  // 结构 + 值签名（Phase 5）：字段集合与将要渲染的值都没变就不重建 DOM。
  // 此前每次重算都无条件销毁/重建条件框（4 个面板 × 每次按键），白付 DOM 代价。
  // ⚠️ 值部分必须与下方渲染逻辑同口径：元素已存在 → 读当前值；不存在 → 回退 f.def。
  //    否则「首渲前（无元素）」与「首渲后（读回默认值）」签名不一致，守卫永不命中。
  const condSig = visibleFields.map(f => f.key + ':' + f.type + ':' + (f.def === undefined ? '' : f.def)).join(',')
    + '#' + visibleFields.map(f => {
        const el = document.getElementById(`trait-opt-${mode}-${side}-${f.key}`);
        if (el) return f.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value;
        if (f.type === 'checkbox') return f.def ? 1 : 0;
        return (f.def === undefined ? '' : f.def);
      }).join(',');
  if (container.dataset.traitCondSig === condSig && container.firstChild) return;
  container.dataset.traitCondSig = condSig;
  bumpTraitOptsVersion(mode, side);   // 条件 DOM 被重写 → 签名缓存失效

  ﻿const accentColor = side === 'atk' ? 'var(--atk-color)' : '#42a5f5';

  // 渲染前保存已有的用户输入状态，避免重建时丢失
  const _savedVals = {};
  visibleFields.forEach(f => {
    const _el = document.getElementById(`trait-opt-${mode}-${side}-${f.key}`);
    if (_el) _savedVals[f.key] = f.type === 'checkbox' ? _el.checked : _el.value;
  });

  let html = `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;padding:6px 8px;background:rgba(124,107,255,.06);border-radius:7px;border:1px dashed rgba(124,107,255,.2)">`;
  html += `<div style="width:100%;font-size:10px;color:${accentColor};font-weight:600;margin-bottom:1px">⚙️ 特性生效条件</div>`;

  visibleFields.forEach(f => {
    const targetId = `trait-opt-${mode}-${side}-${f.key}`;
    const savedVal = _savedVals.hasOwnProperty(f.key) ? _savedVals[f.key] : f.def;
    if (f.type === 'checkbox') {
      const checked = savedVal ? 'checked' : '';
      html += `<label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;white-space:nowrap">
        <input type="checkbox" id="${targetId}" ${checked} onchange="onTraitCondChange('${mode}','${side}')"> ${f.label}
      </label>`;
    } else {
      html += `<div style="display:flex;align-items:center;gap:4px;font-size:11px;white-space:nowrap">
        <span>${f.label}：</span>
        <input type="number" id="${targetId}" value="${savedVal}" min="${f.min||0}" max="${f.max||99}"
          style="width:52px;padding:2px 4px;background:var(--card2);border:1px solid var(--border);border-radius:5px;color:${accentColor};text-align:center;font-size:11px;font-weight:700"
          oninput="onTraitCondChange('${mode}','${side}')">
      </div>`;
    }
  });
  html += '</div>';
  container.innerHTML = html;
}
// 条件变更时重算
function onTraitCondChange(mode, side) {
  // skill 可能为 null（尚未选技能）：仍要让条件变化立即反映到输入框与说明文字
  bumpTraitOptsVersion(mode, side);   // 用户改了条件输入 → 签名缓存失效
  const skill = state.selectedSkillName ? SKILLS.find(s => s.n === state.selectedSkillName) : null;
  const opts = readTraitOptsByMode(mode, side);

  if (side === 'atk') {
    const r = calcAtkTraitMult(state.atk, state.def, skill, opts);
    updateTraitInputVisibility(mode, 'atk', state.atk ? state.atk.tr : null, r, collectStatBuffs(r.stat, state.atkStat === 'patk', 'atk'));
    const nameEl = document.getElementById(`trait-atk-name-${mode}`);
    const descEl = document.getElementById(`trait-atk-desc-${mode}`);
    const atkTr = state.atk ? state.atk.tr : null;
    renderTraitNameWithNote(nameEl, atkTr, r.desc, '✨');
    if (descEl) descEl.textContent = (state.atk && state.atk.tr_desc) || '';
  } else {
    const r = calcDefTraitMult(state.atk, state.def, skill, opts);
    updateTraitInputVisibility(mode, 'def', state.def ? state.def.tr : null, r, collectStatBuffs(r.stat, state.atkStat === 'patk', 'def'));
    const nameEl = document.getElementById(`trait-def-name-${mode}`);
    const descEl = document.getElementById(`trait-def-desc-${mode}`);
    const defTr = state.def ? state.def.tr : null;
    renderTraitNameWithNote(nameEl, defTr, r.desc, '🛡️');
    if (descEl) descEl.textContent = (state.def && state.def.tr_desc) || '';
  }
  // 触发重算
  if (mode === 'b') calc(); else calcFull();
}

function readTraitOptsByMode(mode, side) {
  const opts = {};
  // side 为 'atk'|'def'，新版 ID 格式：trait-opt-{mode}-{side}-{key}
  // 兼容旧版（无 side）：trait-opt-{mode}-{key}
  const prefixNew = side ? `trait-opt-${mode}-${side}-` : null;
  const prefixOld = `trait-opt-${mode}-`;
  // 无 side 时也尝试 atk/def 前缀（新版渲染格式）
  const prefixAtk = !side ? `trait-opt-${mode}-atk-` : null;
  const prefixDef = !side ? `trait-opt-${mode}-def-` : null;
  function readEl(k) {
    return (prefixNew && document.getElementById(prefixNew + k))
        || (prefixAtk && document.getElementById(prefixAtk + k))
        || (prefixDef && document.getElementById(prefixDef + k))
        || document.getElementById(prefixOld + k);
  }
  // 按前缀全量扫描：规则表新增任何 key 都无需改动此处代码。
  // 先按精确前缀取（优先级：side 前缀 > atk > def > 旧无 side）
  const prefixes = [prefixNew, prefixAtk, prefixDef, prefixOld].filter(Boolean);
  const seen = new Set();
  for (const p of prefixes) {
    document.querySelectorAll('[id^="' + p + '"]').forEach(el => {
      const key = el.id.slice(p.length);
      if (!key || seen.has(key)) return;          // 已有更高优先级来源，跳过
      seen.add(key);
      if (el.type === 'checkbox') opts[key] = el.checked;
      else opts[key] = parseInt(el.value) || 0;
    });
    if (Object.keys(opts).length > 0) break;       // 命中即停，避免旧 ID 干扰
  }
  // 兜底：补齐历史代码硬编码读取的几个 key（无 side 时按旧格式）
  if (Object.keys(opts).length === 0) {
    ['faster','activated','rainy','enemyIsPolluted','defCarriesSameAttr'].forEach(k => {
      const el = readEl(k);
      if (el && el.type === 'checkbox') opts[k] = el.checked;
    });
    ['stackCount','enemyTotalCost','enemyBuff'].forEach(k => {
      const el = readEl(k);
      if (el) opts[k] = parseInt(el.value) || 0;
    });
  }
  return opts;
}

function readTraitOpts() {
  // 兼容旧代码，优先读mode-b的选项
  return readTraitOptsByMode('b');
}
// ================================================================
// 技能威力条件（data/skillMult.js）的输入 / 渲染 / 读取
// ================================================================
// 命名空间 pwr-opt-{mode}-{slot}-{key}，与 trait-opt-* 完全隔离，避免冲突。
// slot：模式 B 用 'b'；FULL 模式用 `${side}${i}`（如 atk0 / def2）

// 取当前选中的技能对象（FULL 模式可显式传入）
function currentSkillObj(slot) {
  if (typeof SKILLS === 'undefined') return null;
  if (slot && slot.skill) return slot.skill;
  if (!state.selectedSkillName) return null;
  return SKILLS.find(s => s.n === state.selectedSkillName) || null;
}
