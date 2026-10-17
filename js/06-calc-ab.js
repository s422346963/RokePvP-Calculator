// js/06-calc-ab.js — 模式 A/B：switchMode / calc / 技能下拉 picker / 模式 B 属性选择器
// 加载顺序位次 6。依赖 js/01~05 全部声明；calc() 只调 computeDamage（js/02，唯一实现点）。
// 本文件只有声明；顶层 init（switchMode(state.mode) 等）在 js/08-fav-init.js。
function switchMode(m) {
  state.mode = m;
  ['A','B','FULL'].forEach(id => {
    const tab = document.getElementById('tab-mode' + id.toLowerCase());
    const sec = document.getElementById('section-mode' + id.toLowerCase());
    if (tab) tab.className = 'mode-tab' + (m === id ? ' active' : '');
    if (sec) sec.className = 'mode-section' + (m === id ? ' active' : '');
  });
  // FULL 模式隐藏公共 result-panel，其他模式恢复显示
  const rp = document.getElementById('result-panel');
  if (rp) rp.style.display = m === 'FULL' ? 'none' : '';
  if (m === 'FULL') calcFull();
  else {
    // FULL 模式选择的技能不回填 Tab2：B 模式保持自己在 B 里选的技能，两侧互不影响
    calc();
  }
}

// ============================================================
// CALCULATION
// ============================================================

function calc() {
  // FULL 模式下所有计算走 calcFull()，避免 result-panel 被隐藏导致结果不更新
  if (state.mode === 'FULL') { calcFull(); return; }
  const rp = document.getElementById('result-panel');
  if (!state.atk || !state.def) {
    rp.innerHTML = '<div style="color:var(--text2);font-size:14px;text-align:center;padding:12px">请选择双方精灵并设置技能参数</div>';
    return;
  }

  const atkBase  = state.atk[state.atkStat];
  const defBase  = state.def[state.defStat];
  const defHp    = state.def.real_hp || state.def.hp;
  const atkMult  = levelMult(state.atkAtkLevel);
  const defMult  = levelMult(state.defDefLevel);
  // atkFinal / defFinal（含特性攻防加成与能力等级）由 computeDamage 产出，见下方

  const reduceId   = state.mode === 'A' ? 'def-reduce' : 'def-reduce-b';
  const reducePct  = parseFloat(document.getElementById(reduceId).value) || 0;
  const reduceMult = 1 - Math.min(99, Math.max(0, reducePct)) / 100;

  // 星陨印记（幻系技能不触发星陨）
  const starMarksId = state.mode === 'A' ? 'star-marks-a' : 'star-marks-b';
  const isPhantomSkill = state.skillAttr === '幻';
  const starMarksEl = document.getElementById(starMarksId);
  if (isPhantomSkill) {
    starMarksEl.disabled = true;
    starMarksEl.title = '幻系技能不触发星陨印记';
    starMarksEl.style.opacity = '0.4';
  } else {
    starMarksEl.disabled = false;
    starMarksEl.title = '';
    starMarksEl.style.opacity = '';
  }
  const starMarks = isPhantomSkill ? 0 : Math.max(0, Math.min(100, parseInt(starMarksEl.value) || 0));

  let dmg = 0, formulaStr = '';
  let stabMult = 1, typeEff = 1, traitMult = 1, extraMult = 1, power = 0;
  let atkTraitMult = 1, defTraitMult = 1;  // 预声明，避免 mode=A 时 breakdown 引用未定义变量
  let hits = 1;
  // 技能威力规则解析结果（模式 B 生效；模式 A 威力为游戏内显示值，不走规则表）
  let pw = { powerAdd: 0, powerPct: 0, powerMult: 1, hitsSet: null, label: '', hasRule: false, unimplemented: false };
  // 特性攻防属性加成（stat 通道）
  let atkBuffs = { pctMult: 1, flatSum: 0, sources: [] };
  let defBuffs = { pctMult: 1, flatSum: 0, sources: [] };
  let atkTraitPowerPct = 0;   // 特性威力百分比（已并入 powerMult，保留占位）
  let traitPowerMult = 1;      // 特性威力倍率（威力公式乘法段）
  let traitPowerBonusFinal = 0; // 特性威力加成（威力公式加法段）
  let traitPowerShown = 0;      // 特性威力加成（拆解展示用）
  let atkPctMultFinal = 1, atkFlatFinal = 0;
  let defPctMultFinal = 1, defFlatFinal = 0;
  let traitMultFromInput = 1;  // 结算层「特性倍率」（攻 × 防）
  let res = null;

  if (state.mode === 'A') {
    // ── 模式 A：威力按游戏内显示值，不吃克制/本系/能力等级/特性 ──
    const powerA = parseFloat(document.getElementById('power-input').value) || 0;
    hits = Math.max(1, parseInt(document.getElementById('hits-input').value) || 1);
    extraMult = parseFloat(document.getElementById('extra-mult-a').value) || 1;
    res = computeDamage({
      atkBase: atkBase, defBase: defBase,
      useLevel: false,                 // 模式 A 不套能力等级
      powerBase: powerA,
      powerMult: 1, powerTraitMult: 1, powerPct: 0, powerAdd: 0, powerTraitBonus: 0,
      typeEff: 1, stab: 1, traitMult: 1, extraMult, reduceMult, hits,
    });
    power = powerA;
    dmg = res.dmg;
    formulaStr = `(${f1(res.attackValue)} / ${f1(res.defenseValue)}) × 37/41 × ${power}` +
      (extraMult !== 1 ? ` × ${extraMult}(其他)` : '') +
      (reduceMult < 1 ? ` × ${f2(reduceMult)}(减伤)` : '') +
      (hits > 1 ? ` × ${hits}连击` : '') +
      ` = ${f1(dmg)}`;
  } else {
    // ── 模式 B ──
    const skillObj = currentSkillObj();
    const isPhysB = state.atkStat === 'patk';
    // ⚠️ 必须先刷新：条件勾选框此时已渲染，readTraitOptsByMode 才能读到真实 opts，
    //    从而正确判定输入框显隐并回填规则值（否则首次读到的是上一轮的陈旧值）
    refreshStatAreas('b', skillObj);
    const traitOptsAtk = readTraitOptsByMode('b', 'atk');
    const traitOptsDef = readTraitOptsByMode('b', 'def');
    const trAtk = calcAtkTraitMult(state.atk, state.def, skillObj, traitOptsAtk);
    const trDef  = calcDefTraitMult(state.atk, state.def, skillObj, traitOptsDef);

    // 技能威力规则（先加减、后乘除的加减段与乘除段分离）
    pw = resolveSkillPower(skillObj, buildPowerCtx('b', 'b', skillObj));

    // 特性攻防加成（侧向：物攻技能只吃 patk/pdef）+ 特性输入框覆盖
    atkBuffs = collectStatBuffs(trAtk.stat, isPhysB, 'atk');
    defBuffs = collectStatBuffs(trDef.stat, isPhysB, 'def');
    const atkIn = readTraitInputs('b', 'atk', state.atk ? state.atk.tr : null, trAtk, atkBuffs);
    const defIn = readTraitInputs('b', 'def', state.def ? state.def.tr : null, trDef, defBuffs);
    // 攻防层最终生效值：输入框可见时以输入框为权威值（已自动填入规则值），
    // 不可见时 readTraitInputs 回退为规则算出的值 —— 两者都是「单一份量值」，不会重复叠加。
    atkPctMultFinal = atkIn.atkMult;
    atkFlatFinal = atkIn.atkAdd;
    defPctMultFinal = defIn.atkMult;
    defFlatFinal = defIn.atkAdd;
    atkTraitPowerPct = 0;   // powerPct 已并入 powerMult
    traitPowerMult = atkIn.powerMult;
    // ⚠️ 只有**攻方**特性进入本次伤害的威力段。
    //    防方路径（calcDefTraitMult）只采纳 f 与 stat，威力层通道对它恒为 1/0；
    //    此处若叠加 defIn.powerAdd，防方面板里「蒸汽膨胀」这类只增强自身出招的特性
    //    会被算进攻方伤害（历史 bug）。口径同 stat 通道：防方特性不改攻方攻击力/威力。
    traitPowerBonusFinal = atkIn.powerAdd;

    // 特性威力（威力加法型特性，如蒸汽膨胀 +10/次）：读取「特性威力」输入框，
    // 由 updateTraitPanelForMode / onTraitCondChange 自动同步，也可手动覆盖
    traitPowerShown = traitPowerBonusFinal;

    const powerBaseB = parseFloat(document.getElementById('base-power-b').value) || 0;
    hits = pw.hitsSet || Math.max(1, parseInt(document.getElementById('hits-input-b').value) || 1);
    // 属性克制 / 本系：原「自动填入」输入框已移除，直接由技能属性 + 双方精灵计算
    typeEff  = state.def ? getTypeEff(state.skillAttr, state.def.a1, state.def.a2 || null) : 1;
    stabMult = (state.atk && hasStab(state.atk, state.skillAttr)) ? 1.25 : 1;
    atkTraitMult = atkIn.mult;
    defTraitMult = defIn.mult;
    traitMult  = atkTraitMult * defTraitMult;
    extraMult  = parseFloat(document.getElementById('extra-mult-b').value) || 1;

    res = computeDamage({
      atkBase, defBase,
      useLevel: true,
      atkFlat: atkFlatFinal, atkPctMult: atkPctMultFinal, atkLevelMult: atkMult,
      defFlat: defFlatFinal, defPctMult: defPctMultFinal, defLevelMult: defMult,
      powerBase: powerBaseB,
      powerMult: pw.powerMult,          // 应对倍率（技能侧）
      powerTraitMult: traitPowerMult,   // 特性威力倍率
      powerPct: pw.powerPct,            // 本次威力 +N%
      powerAdd: pw.powerAdd,            // 技能威力加成
      powerTraitBonus: traitPowerBonusFinal, // 特性威力加成
      typeEff, stab: stabMult, traitMult, extraMult, reduceMult, hits,
    });
    power = res.powerFinal;
    dmg = res.dmg;

    // 刷新「本次威力修正」区（条件输入 + 链路）
    renderPowerCond(skillObj, 'b', 'b', document.getElementById('power-mod-b'));

    // 公式串：按四层链路生成
    const atkChain = `${f1(res.attackValue)}`;
    const defChain = `${f1(res.defenseValue)}`;
    // 威力处直接填「最终威力」(powerFinal)：公式与游戏口径一致，可直接对数字。
    //   (基础威力区 + 固定威力提升区) × 技能威力乘区 的分解见拆解面板的「威力层」。
    formulaStr = `(${atkChain} / ${defChain}) × 37/41 × ${f1(res.powerFinal)}` +
      (typeEff  !== 1 ? ` × ${typeEff}(克制)` : '') +
      (stabMult !== 1 ? ` × ${stabMult}(本系)` : '') +
      (atkTraitMult !== 1 ? ` × ${f2(atkTraitMult)}(攻方特性)` : '') +
      (defTraitMult !== 1 ? ` × ${f2(defTraitMult)}(防方特性)` : '') +
      (extraMult!== 1 ? ` × ${extraMult}(其他)` : '') +
      (reduceMult< 1 ? ` × ${f2(reduceMult)}(减伤)` : '') +
      (hits > 1 ? ` × ${hits}连击` : '') +
      ` = ${f1(dmg)}`;
  }

  // 攻击层 / 防御层最终值（四层拆解与星陨共用）
  const atkFinal = res.attackValue;
  const defFinal = res.defenseValue;

  // 星陨伤害计算
  // 威力公式：x*x + 24*x - 24，x = 星陨层数
  // 星陨为幻系伤害，物理/魔法跟随触发技能
  // 使用与普通伤害相同的攻防值和减伤比
  let starDmg = 0, starFormula = '', starPower = 0;
  if (starMarks > 0) {
    starPower = starMarks * starMarks + 24 * starMarks - 24;
    // 幻系克制：查幻系对防御方属性的效果
    const starTypeEff = getTypeEff('幻', state.def.a1, state.def.a2 || '');
    // 星陨不计入本系加成（幻系技能，攻击方一般不是幻系）
    // 套用相同攻防值和减伤
    starDmg = Math.floor((atkFinal / defFinal) * (37/41) * starPower * starTypeEff * reduceMult);
    const starEffStr = starTypeEff !== 1 ? ` × ${starTypeEff}(幻系克制)` : '';
    const starReduceStr = reduceMult < 1 ? ` × ${f2(reduceMult)}(减伤)` : '';
    starFormula = `威力(${starMarks}层) = ${starMarks}²+24×${starMarks}-24 = ${starPower}` +
      `\n(${f1(atkFinal)} / ${f1(defFinal)}) × 37/41 × ${starPower}${starEffStr}${starReduceStr} = ${f1(starDmg)}`;
  }

  const pct = defHp > 0 ? dmg / defHp * 100 : 0;
  const barW = Math.min(100, pct).toFixed(1);
  const barCls = pct >= 50 ? 'fill-red' : pct >= 25 ? 'fill-yellow' : 'fill-green';
  const pctColor = pct >= 50 ? '#ef5350' : pct >= 25 ? '#ffa726' : '#66bb6a';

  let effLabel = '', effCls = '';
  if (typeEff === 0)       { effLabel = '免疫';           effCls = 'eff-05x'; }
  else if (typeEff >= 3)   { effLabel = '双重克制 ×3';    effCls = 'eff-4x';   }
  else if (typeEff === 2)  { effLabel = '克制 ×2';        effCls = 'eff-2x';   }
  else if (typeEff <= 0.25){ effLabel = '双重抵抗 ×1/4';  effCls = 'eff-025x'; }
  else if (typeEff < 1)    { effLabel = '抵抗 ×0.5';      effCls = 'eff-05x';  }
  else                     { effLabel = '普通效果';        effCls = 'eff-1x';   }

  const asLabel = state.atkStat === 'patk' ? '物攻' : '魔攻';
  const dsLabel = state.defStat === 'pdef' ? '物防' : '魔防';
  const alStr   = state.atkAtkLevel >= 0 ? '+'+state.atkAtkLevel : ''+state.atkAtkLevel;
  const dlStr   = state.defDefLevel >= 0 ? '+'+state.defDefLevel : ''+state.defDefLevel;

  const modeTag = state.mode === 'A'
    ? '<span style="font-size:11px;background:rgba(124,107,255,.25);color:#a89fff;border:1px solid rgba(124,107,255,.4);padding:1px 8px;border-radius:8px;margin-left:6px">模式A</span>'
    : '<span style="font-size:11px;background:rgba(255,107,157,.25);color:#ff9bbf;border:1px solid rgba(255,107,157,.4);padding:1px 8px;border-radius:8px;margin-left:6px">模式B</span>';

  // 攻防属性行：模式A不吃能力等级（atkFinal===atkBase），不显示 "× 1.00 =" 这类未参与运算的倍率；
  // 模式B仅当倍率实际生效（≠1）时才展开 "基础 × 倍率 = 最终"
  const atkLvActive = state.mode === 'B' && atkMult !== 1;
  const defLvActive = state.mode === 'B' && defMult !== 1;
  const atkBreak = atkLvActive ? `${atkBase} × ${f2(atkMult)} = ${f1(atkFinal)}` : `${f1(atkFinal)}`;
  const defBreak = defLvActive ? `${defBase} × ${f2(defMult)} = ${f1(defFinal)}` : `${f1(defFinal)}`;
  const atkLvSuffix = atkLvActive ? `（等级${alStr}）` : '';
  const defLvSuffix = defLvActive ? `（等级${dlStr}）` : '';

  rp.innerHTML = `
    <div style="margin-bottom:16px">
      <div style="font-size:11px;color:var(--text2);margin-bottom:4px;display:flex;align-items:center">
        ${state.atk.n} &#x2192; ${state.def.n} ${modeTag}
      </div>
      <div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap">
        <span style="font-size:36px;font-weight:900;color:var(--text)">${f1(dmg)}</span>
        <span style="font-size:14px;color:var(--text2)">伤害</span>
        ${state.mode==='B' ? `<span class="eff-tag ${effCls}">${effLabel}</span>` : ''}
        ${stabMult > 1 ? '<span class="eff-tag" style="background:rgba(255,200,0,.25);color:#ffd700;border:1px solid rgba(255,200,0,.4)">本系 ×1.25</span>' : ''}
        ${reducePct > 0 ? `<span class="eff-tag" style="background:rgba(100,200,100,.25);color:#80e080;border:1px solid rgba(100,200,100,.4)">减伤 ${reducePct}%</span>` : ''}
      </div>
    </div>

    <div class="hp-section">
      <div class="hp-header">
        <span>${state.def.n} HP：<b>${defHp}</b></span>
        <span style="font-weight:700;color:${pctColor}">${pct.toFixed(1)}%</span>
      </div>
      <div class="hp-bar-track">
        <div class="hp-bar-fill ${barCls}" style="width:${barW}%"></div>
        <span class="hp-pct">${pct.toFixed(1)}%</span>
      </div>
      <div style="font-size:11px;color:var(--text2);margin-top:4px">
        ${pct>=100?'⚡ 可一击击倒！':pct>=50?'💥 大于半血伤害':pct>=25?'🎯 约四分之一血':'💧 伤害较低'}
      </div>
    </div>

    <div class="breakdown">
      ${renderLayersHtml({
        mode: state.mode, res, pw,
        atkBase, defBase, atkBuffs, defBuffs, atkMult, defMult,
        atkPctMult: atkPctMultFinal, defPctMult: defPctMultFinal,
        atkFlat: atkFlatFinal, defFlat: defFlatFinal,
        asLabel, dsLabel, atkLvSuffix, defLvSuffix,
        typeEff, stabMult, atkTraitMult, defTraitMult, extraMult, reducePct, reduceMult,
        hits, dmg, atkTraitPowerPct, traitPowerShown,
      })}
    </div>
    <div class="formula-row"><b>公式：</b> ${formulaStr}</div>
    ${starMarks > 0 ? `
    <div style="margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08)">
      <div style="font-size:12px;color:#ce93d8;font-weight:700;margin-bottom:8px">&#x2B50; 星陨追加伤害（${starMarks}层 · 幻系 ${state.atkStat==='patk'?'物攻':'魔攻'}）</div>
      <div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;margin-bottom:10px">
        <span style="font-size:28px;font-weight:900;color:#ce93d8">${f1(starDmg)}</span>
        <span style="font-size:13px;color:var(--text2)">星陨伤害</span>
        ${(() => { const se = getTypeEff('幻', state.def.a1, state.def.a2||''); return se===0?'<span class="eff-tag eff-05x">免疫</span>':se>=3?'<span class="eff-tag eff-4x">双重克制 ×3</span>':se===2?'<span class="eff-tag eff-2x">克制 ×2</span>':se<=0.25?'<span class="eff-tag eff-025x">双重抵抗 ×1/4</span>':se<1?'<span class="eff-tag eff-05x">抵抗 ×0.5</span>':''; })()}
        <span style="font-size:11px;background:rgba(206,147,216,.18);color:#ce93d8;border:1px solid rgba(206,147,216,.35);padding:1px 8px;border-radius:8px">威力 ${starPower}</span>
      </div>
      <div class="hp-section">
        <div class="hp-header">
          <span>${state.def.n} HP：<b>${defHp}</b></span>
          <span style="font-weight:700;color:#ce93d8">${(defHp>0?starDmg/defHp*100:0).toFixed(1)}%</span>
        </div>
        <div class="hp-bar-track">
          <div class="hp-bar-fill" style="width:${Math.min(100,defHp>0?starDmg/defHp*100:0).toFixed(1)}%;background:linear-gradient(90deg,#9c27b0,#ce93d8)"></div>
          <span class="hp-pct">${(defHp>0?starDmg/defHp*100:0).toFixed(1)}%</span>
        </div>
      </div>
      <div class="formula-row" style="white-space:pre-line"><b>星陨公式：</b> ${starFormula}</div>
      <div class="breakdown" style="margin-top:8px">
        <div class="breakdown-item"><span class="bi-label">星陨层数</span><span class="bi-val highlight">${starMarks} 层</span></div>
        <div class="breakdown-item"><span class="bi-label">星陨威力公式</span><span class="bi-val">x²+24x−24</span></div>
        <div class="breakdown-item"><span class="bi-label">实际星陨威力</span><span class="bi-val highlight">${starPower}</span></div>
        <div class="breakdown-item"><span class="bi-label">合计伤害（主技能+星陨）</span><span class="bi-val highlight">${f1(dmg+starDmg)}（HP ${defHp>0?((dmg+starDmg)/defHp*100).toFixed(1):0}%）</span></div>
      </div>
    </div>` : ''}
  `;
}

// ============================================================
// SYNC STAB + TYPE EFF (helper called when attr or spirits change)
//   属性克制 / 本系加成 / 能力等级倍率均为自动计算，相关输入框已移除
// ============================================================
function syncModeBAutoFields() {
  // ── 自动计算特性倍率 ──
  autoUpdateTraitUI();
  // 同步快速技能下拉框
  rebuildQuickSkillSelect();
}

// ── 已搬迁至 js/03-trait.js（特性面板 UI：显隐 / 条件框 / 输入读写）──

// ── 已搬迁至 js/04-power.js（技能威力条件 / 提示 / FULL 变动威力）──
// ============================================================
// SKILL COMBO  合并输入+下拉
// ============================================================

// 缓存当前精灵的全量伤害技能列表（flat，不分组）供过滤用

let _comboAllSkills = [];  // [{skill对象}]

// 技能下拉按属性分组渲染（默认折叠，点击组头展开/收缩，与精灵下拉一致）
function buildSkillGroupHtml(groups, statusSkills) {
  let html = '';
  // 属性排序与精灵下拉一致（普通、草、火…，即 ALL_TYPES 顺序；未知属性排最后）
  Object.keys(groups).sort((a, b) => {
    const ia = ALL_TYPES.indexOf(a), ib = ALL_TYPES.indexOf(b);
    return (ia === -1 ? ALL_TYPES.length : ia) - (ib === -1 ? ALL_TYPES.length : ib);
  }).forEach(attr => {
    const icon = (typeof TYPE_ICONS !== 'undefined' && TYPE_ICONS[attr])
      ? '<img src="' + TYPE_ICONS[attr] + '" alt="" class="type-tag-icon" loading="lazy" onerror="this.remove()">'
      : '';
    html += '<div class="dropdown-group-header" data-attr="' + attr + '" style="text-align:left;padding:4px 12px 2px;display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none">' +
      icon +
      '<span style="font-size:11px;color:var(--text2)">' + groups[attr].length + ' 个</span>' +
      '<span class="type-tag" style="background:' + (TYPE_COLORS[attr] || '#888') + ';color:' + (TYPE_TEXT_DARK.has(attr) ? '#333' : '#fff') + ';font-size:11px;margin-left:auto">' + attr + '</span>' +
      '<span style="font-size:10px;color:var(--text2)" class="group-arrow">▶</span>' +
      '</div>' +
      '<div class="dropdown-group-body" data-attr="' + attr + '" style="display:none">' +
        groups[attr].sort((a, b) => b.p - a.p).map(s => makeSkillItem(s)).join('') +
      '</div>';
  });
  if (statusSkills.length) {
    html += '<div class="dropdown-group-header" data-attr="__status__" style="text-align:left;padding:4px 12px 2px;display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none">' +
      '<span style="font-size:11px;color:#80cbc4;font-weight:600">状态技能</span>' +
      '<span style="font-size:11px;color:var(--text2)">' + statusSkills.length + ' 个</span>' +
      '<span style="font-size:10px;color:var(--text2);margin-left:auto" class="group-arrow">▶</span>' +
      '</div>' +
      '<div class="dropdown-group-body" data-attr="__status__" style="display:none">' +
        statusSkills.sort((a, b) => a.n.localeCompare(b.n, 'zh')).map(s => makeSkillItem(s)).join('') +
      '</div>';
  }
  return html;
}

// 绑定技能下拉组头点击展开/收缩
function bindSkillGroupToggle(container) {
  container.querySelectorAll('.dropdown-group-header').forEach(hdr => {
    // 阻止 mousedown 默认行为，避免 FULL 模式下 input 因失焦而关闭下拉
    hdr.addEventListener('mousedown', e => e.preventDefault());
    hdr.addEventListener('click', () => {
      const attr = hdr.dataset.attr;
      const body = container.querySelector('.dropdown-group-body[data-attr="' + attr + '"]');
      if (!body) return;
      const arrowEl = hdr.querySelector('.group-arrow');
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      if (arrowEl) arrowEl.textContent = isOpen ? '▶' : '▼';
    });
  });
}

function rebuildQuickSkillSelect() {
  // 重新构建 _comboAllSkills 并渲染面板（无过滤）
  const input = document.getElementById('skill-combo-input');
  if (!input) return;

  const total = SKILLS.length;
  _comboAllSkills = SKILLS.map(s => ({ skill: s }));
  input.placeholder = '搜索技能… （' + total + ' 个）';
  input.readOnly = false;

  // 默认面板：合法技能按属性分组
  renderComboPanel('');
}

function renderComboPanel(q) {
  const dd = document.getElementById('skill-combo-dropdown');
  if (!dd) return;

  const filtered = q
    ? _comboAllSkills.filter(e => matchQuery(e.skill.n, q))
    : _comboAllSkills;

  if (!filtered.length) {
    dd.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--text2)">无匹配技能</div>';
    return;
  }

  let html = '';

  if (!q) {
    // 无输入时：按属性分组显示（状态技能单独分组）
    const groups = {};
    const statusSkills = [];
    filtered.forEach(e => {
      if (e.skill.k === '状态') { statusSkills.push(e.skill); return; }
      const a = e.skill.a;
      if (!groups[a]) groups[a] = [];
      groups[a].push(e.skill);
    });

    html = buildSkillGroupHtml(groups, statusSkills);
  } else {
    // 有输入时：扁平列表
    filtered.forEach(e => { html += makeSkillItem(e.skill); });
  }

  dd.innerHTML = html;
  bindSkillGroupToggle(dd);
  dd.querySelectorAll('.skill-lib-item').forEach(item => {
    item.addEventListener('mousedown', e => {
      e.preventDefault();
      const skill = SKILLS.find(s => s.n === item.dataset.name);
      if (skill) applyQuickSkill(skill);
    });
  });
}

function makeSkillItem(skill) {
  const isStatus  = skill.k === '状态';
  const kindColor = skill.k === '物攻' ? '#ff9966' : skill.k === '魔攻' ? '#88aaff' : '#80cbc4';
  // 属性仅以图标展示在技能名称前（悬停 title 显示属性名），不再用图标+属性名标签
  const attrIcon  = (!isStatus && typeof TYPE_ICONS !== 'undefined' && TYPE_ICONS[skill.a])
    ? '<img src="' + TYPE_ICONS[skill.a] + '" alt="' + skill.a + '" title="' + skill.a + '系" class="type-tag-icon" loading="lazy" onerror="this.remove()">'
    : '';
  const attrTag   = isStatus
    ? '<span class="sli-kind" style="color:#80cbc4;font-weight:600">状态</span>'
    : '<span class="sli-kind" style="color:' + kindColor + ';font-weight:600">' + skill.k + '</span>';
  const powerTag  = isStatus
    ? '<span class="sli-power" style="color:var(--text2)">威力 --</span>'
    : '<span class="sli-power">威力 ' + skill.p + '</span>';
  return '<div class="skill-lib-item" data-name="' + skill.n + '">' +
    attrIcon +
    '<span class="sli-name">' + skill.n + '</span>' +
    attrTag +
    powerTag +
  '</div>';
}

function onSkillComboFocus() {
  const input = document.getElementById('skill-combo-input');
  const dd    = document.getElementById('skill-combo-dropdown');
  if (!dd || !_comboAllSkills.length) return;
  // 点击后清空框内文字（露出占位提示）并弹出全量分组列表 —— 与「未选择技能」一致；
  // 未做选择则失焦时恢复已选技能名（未修改 → 变回原样）
  if (isPickedDisplay(input)) setPickerValue(input, '');
  input.removeAttribute('readonly');
  renderComboPanel(input.value.trim());
  dd.classList.add('open');
  // 每次展开都回到顶部：不保留上次的滚动位置（display:none 时写 scrollTop 无效，必须在 open 之后）
  dd.scrollTop = 0;
  const arrow = document.getElementById('skill-combo-arrow');
  if (arrow) arrow.textContent = '▲';

  const closeHandler = e => {
    const wrap = document.getElementById('skill-combo-wrap');
    if (wrap && !wrap.contains(e.target)) {
      dd.classList.remove('open');
      if (arrow) arrow.textContent = '▼';
      // 失焦后恢复已选技能名（若有）→ 回到占位显示
      if (state.selectedSkillName) setPickerValue(input, state.selectedSkillName);
      else clearPickerPlaceholder(input);
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

function onSkillComboInput() {
  const input = document.getElementById('skill-combo-input');
  const dd    = document.getElementById('skill-combo-dropdown');
  if (!dd) return;
  clearPickerPlaceholder(input);       // 开始输入 → 名称不再是占位符
  renderComboPanel(input.value.trim());
  if (!dd.classList.contains('open')) {
    dd.classList.add('open');
    const arrow = document.getElementById('skill-combo-arrow');
    if (arrow) arrow.textContent = '▲';
  }
}

// 技能固有连击数：data/skills.js 的 cb 字段（由 gen_skill_cb.py 从描述提取），默认 1
function skillDefaultHits(skill) {
  return Math.max(1, (skill && skill.cb) || 1);
}

function applyQuickSkill(skill) {
  const input = document.getElementById('skill-combo-input');
  const dd    = document.getElementById('skill-combo-dropdown');
  const arrow = document.getElementById('skill-combo-arrow');
  setPickerValue(input, skill.n);   // 名称仅作占位显示（灰字），点击后按未选择处理
  if (dd)    dd.classList.remove('open');
  if (arrow) arrow.textContent = '▼';

  document.getElementById('base-power-b').value = skill.p;
  // 连击次数同步为技能固有连击数
  const hitsB = document.getElementById('hits-input-b');
  if (hitsB) hitsB.value = skillDefaultHits(skill);
  // 双攻技能：取攻方物攻/魔攻较高一项，与伤害计算(isPhys)逻辑一致
  const isPhys = skill.k === '双攻'
    ? ((state.atk ? (state.atk.patk || state.atk.pa || 0) : 0) >= (state.atk ? (state.atk.matk || state.atk.ma || 0) : 0))
    : skill.k === '物攻';
  setSkillType(isPhys ? 'physical' : 'magical');
  state.skillAttr = skill.a;
  state.selectedSkillName = skill.n;
  document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('selected', b.textContent === skill.a));
  syncModeBAutoFields();
  const selIcon = (typeof TYPE_ICONS !== 'undefined' && TYPE_ICONS[skill.a])
    ? '<img src="' + TYPE_ICONS[skill.a] + '" alt="' + skill.a + '" title="' + skill.a + '系" class="type-tag-icon" onerror="this.remove()">'
    : '';
  // 技能说明：恢复常驻显示（与改动前一致）
  const descEl = document.getElementById('skill-desc-info');
  if (descEl) {
    descEl.textContent = (skill.desc || '暂无描述');
    descEl.style.display = '';
  }
  // 特殊机制提示不再常驻成框：改为「已选：XX」后的圆圈感叹号，
  // 悬停展示、移开即隐藏；内容与显隐由 updatePowerTip() 填充（无提示的技能会自动隐藏图标）
  const tipIcon = '<span class="skill-tip-icon" style="display:none">!<span class="skill-tooltip"></span></span>';
  document.getElementById('skill-selected-info').innerHTML =
    '已选：' + selIcon + skill.n + tipIcon + ' | ' + skill.a + '属性 | ' + skill.k + ' | 能耗 ' + (skill.c === undefined ? '—' : skill.c) + ' | 基础威力 ' + skill.p;
  updatePowerTip();   // 必须在信息行重建之后：它要把提示写进行内的图标
  // 选完即失焦：光标留在框内会导致再次点击不触发 focus → 下拉无法重新展开
  // （放在 state.selectedSkillName 更新之后，失焦还原才会写回新技能名）
  if (input) input.blur();
  calc();
}


// ============================================================
// TYPE SELECTOR
// ============================================================
function buildTypeSelector(containerId) {
  const sel = document.getElementById(containerId);
  if (!sel) return;
  ALL_TYPES.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'type-btn' + (t === state.skillAttr ? ' selected' : '');
    btn.textContent = t;
    btn.style.borderColor = TYPE_COLORS[t] || '#ccc';
    btn.onclick = () => {
      state.skillAttr = t;
      document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('selected', b.textContent === t));
      syncModeBAutoFields();
      calc();
    };
    sel.appendChild(btn);
  });
}

// ============================================================
// SPIRIT SEARCH
// ============================================================
// 属性标签：属性图标 + 属性名（图标加载失败时降级为纯文字；extraStyle 追加内联样式）
function typeTagHtml(type, extraStyle) {
  if (!type) return '';
  const bg = TYPE_COLORS[type] || '#888';
  const tc = TYPE_TEXT_DARK.has(type) ? '#333' : '#fff';
  const icon = (typeof TYPE_ICONS !== 'undefined' && TYPE_ICONS[type])
    ? `<img src="${TYPE_ICONS[type]}" alt="" class="type-tag-icon" loading="lazy" onerror="this.remove()">`
    : '';
  return `<span class="type-tag" style="background:${bg};color:${tc};${extraStyle || ''}">${icon}${type}</span>`;
}

function typeChip(type) {
  if (!type) return '';
  const bg = TYPE_COLORS[type] || '#888';
  const tc = TYPE_TEXT_DARK.has(type) ? '#333' : '#fff';
  return `<span class="type-chip" style="background:${bg};color:${tc}">${type}</span>`;
}

function getEmoji(type) {
  return ({'草':'🌿','火':'🔥','水':'💧','光':'✨','地':'🌍','冰':'❄️','龙':'🐉','电':'⚡','毒':'☠️','虫':'🐛','武':'👊','翼':'🦅','萌':'💕','幽':'👻','恶':'😈','机械':'🤖','幻':'🔮','普通':'⭕'})[type] || '🔮';
}

