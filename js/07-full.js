// js/07-full.js — FULL 模式：fullState / buildFullSkillRows / openFskDropdown / selectFskSkill / calcOneFskDmg / calcFull / renderFullResult
// 加载顺序位次 7。依赖 js/01~06 全部声明（calcOneFskDmg 只调 computeDamage）。
// fullState / fullCondOpen 为本文件顶层常量；DOMContentLoaded 里的 buildFullSkillRows 调用在 js/08。
// ============================================================
// FULL MODE — 完整技能配置
// ============================================================

// 每侧4个技能槽状态
const fullState = {
  atk: [null, null, null, null], // 每个元素 {skill, hits} 或 null
  def: [null, null, null, null],
  atkSel: -1, // 当前选中的攻击技能索引（-1=无）
  defSel: -1,
};

// ── 威力修正栏的展开 / 收起（每侧独立，默认收起；▲ 收起 / ▼ 展开）──
//    收起时只是把 .fsk-cond-box 藏起来（DOM 与已填值都保留），技能行因此回到紧凑单行高度。
const fullCondOpen = { atk: false, def: false };

function applyFullCondState(side) {
  const open = !!fullCondOpen[side];
  // 状态挂在整侧的容器上：行重建不会重置它
  const wrap = document.getElementById(`full-${side}-skills`);
  const sideBox = wrap ? wrap.closest('.full-skill-side') : null;
  if (sideBox) sideBox.classList.toggle('cond-open', open);
  const btn = document.getElementById(`full-${side}-cond-toggle`);
  if (btn) {
    // 图标表示「点击后的动作」：收起时 ▲（点击展开）、展开时 ▼（点击收起）
    btn.textContent = open ? '▼' : '▲';
    btn.title = open ? '收起威力修正栏' : '展开威力修正栏';
  }
}

function toggleFullCond(side) {
  fullCondOpen[side] = !fullCondOpen[side];
  applyFullCondState(side);
}

// 技能组件构建器
function buildFullSkillRows(side) {
  const containerId = side === 'atk' ? 'full-atk-skills' : 'full-def-skills';
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  // ── header 行 ──
  const header = document.createElement('div');
  header.className = 'fsk-header-row';
  ['', '类型', '属性', '能耗', '连击', '威力', '修正威力', '备注'].forEach(txt => {
    const cell = document.createElement('span');
    cell.className = 'fsk-header-cell';
    cell.textContent = txt;
    header.appendChild(cell);
  });
  container.appendChild(header);

  // ── 4 个技能行 ──
  for (let i = 0; i < 4; i++) {
    const row = document.createElement('div');
    // fsk-row-bg 是真实 grid 行（有 hover/selected 样式）
    row.className = 'fsk-row-bg' + (fullState[side + 'Sel'] === i ? ' selected' : '');
    row.id = `fsk-${side}-${i}`;
    row.onclick = (e) => {
      // 交互控件区不触发行选中：技能选择框 / 连击 / 威力 / 备注图标 / 本次威力修正区
      //   ⚠️ 之前漏了 .fsk-cond-box：点它的输入框会冒泡到行 → selectFullSkill 重建所有行 →
      //      刚点中的输入框被销毁、焦点丢失，条件根本填不进去（表现为「威力修正无法使用」）
      if (e.target.closest('.fsk-combo-wrap') || e.target.closest('.fsk-hits') || e.target.closest('.fsk-power')
        || e.target.closest('.fsk-tip-icon') || e.target.closest('.fsk-cond-box')) return;
      selectFullSkill(side, i);
    };

    const slotData = fullState[side][i];
    const skillObj = slotData ? slotData.skill : null;
    const hits = slotData ? slotData.hits : 1;

    // 列1：序号 + 技能下拉
    const comboWrap = document.createElement('div');
    comboWrap.className = 'fsk-combo-wrap';
    const idxBadge = document.createElement('span');
    idxBadge.className = 'fsk-idx';
    idxBadge.textContent = i + 1;
    const comboInput = document.createElement('input');
    comboInput.className = 'fsk-combo-input';
    comboInput.id = `fsk-input-${side}-${i}`;
    comboInput.placeholder = '选择技能…';
    setPickerValue(comboInput, skillObj ? skillObj.n : '');   // 技能名仅作占位显示（灰字）
    comboInput.readOnly = true;
    comboInput.autocomplete = 'off';
    const comboArrow = document.createElement('span');
    comboArrow.className = 'fsk-combo-arrow';
    comboArrow.textContent = '▼';
    const dropdown = document.createElement('div');
    dropdown.className = 'fsk-combo-dropdown';
    dropdown.id = `fsk-drop-${side}-${i}`;
    comboInput.addEventListener('focus', () => {
      comboInput.readOnly = false;
      // 点击后清空框内文字并弹出全量分组列表；未做选择则失焦时恢复已选技能名
      if (isPickedDisplay(comboInput)) setPickerValue(comboInput, '');
      openFskDropdown(side, i);
    });
    comboInput.addEventListener('input', () => { clearPickerPlaceholder(comboInput); openFskDropdown(side, i); });
    comboInput.addEventListener('blur', () => {
      setTimeout(() => {
        closeFskDropdown(side, i);
        const sk = fullState[side][i];
        setPickerValue(comboInput, sk ? sk.skill.n : '');      // 失焦 → 回到占位显示
        comboInput.readOnly = true;
      }, 150);
    });
    bindPickerTypeReset(comboInput);
    comboWrap.appendChild(idxBadge);
    comboWrap.appendChild(comboInput);
    comboWrap.appendChild(comboArrow);
    comboWrap.appendChild(dropdown);
    row.appendChild(comboWrap);

    // 列2：类型标签
    const tagSpan = document.createElement('span');
    const skKind = skillObj ? skillObj.k : '';
    const isStatusSkill = skKind === '状态';
    tagSpan.className = 'fsk-tag' + (skKind === '物攻' ? ' phys' : skKind === '魔攻' ? ' magic' : isStatusSkill ? ' status' : '');
    tagSpan.id = `fsk-tag-${side}-${i}`;
    tagSpan.textContent = skKind || '—';
    row.appendChild(tagSpan);

    // 列3：属性标签
    const attrSpan = document.createElement('span');
    const skAttr = skillObj ? skillObj.a : '';
    const attrBg = (skAttr && !isStatusSkill) ? (TYPE_COLORS[skAttr] || '#888') : 'transparent';
    const attrTc = (skAttr && !isStatusSkill) ? (TYPE_TEXT_DARK.has(skAttr) ? '#333' : '#fff') : 'var(--text2)';
    attrSpan.className = 'fsk-attr-tag';
    attrSpan.style.cssText = `background:${attrBg};color:${attrTc}`;
    attrSpan.id = `fsk-attr-${side}-${i}`;
    attrSpan.textContent = isStatusSkill ? '—' : (skAttr || '—');
    row.appendChild(attrSpan);

    // 列4：能耗
    const costSpan = document.createElement('span');
    costSpan.className = 'fsk-tag';
    costSpan.id = `fsk-cost-${side}-${i}`;
    costSpan.style.cssText = 'color:#ffca28;border-color:rgba(255,202,40,.4);font-weight:700;text-align:center;';
    costSpan.textContent = (skillObj && skillObj.c !== undefined) ? String(skillObj.c) : '—';
    row.appendChild(costSpan);

    // 列5：连击次数
    const hitsInput = document.createElement('input');
    hitsInput.type = 'number';
    hitsInput.className = 'fsk-hits';
    hitsInput.id = `fsk-hits-${side}-${i}`;
    hitsInput.min = 1; hitsInput.max = 10;
    hitsInput.value = hits;
    hitsInput.title = '连击次数';
    hitsInput.disabled = isStatusSkill;
    if (isStatusSkill) hitsInput.style.opacity = '0.35';
    hitsInput.oninput = () => {
      if (fullState[side][i]) fullState[side][i].hits = Math.max(1, parseInt(hitsInput.value) || 1);
      calcFull();
    };
    row.appendChild(hitsInput);

    // 变动威力技能（闪击/鸣沙陷阱/冰锋横扫/魔能爆等）：改由 data/skillMult.js 规则表
    // 统一解析，不再在此处逐个 if 硬编码。规则未覆盖时保持用户填写的威力不变。
    if (slotData && skillObj && !isStatusSkill) {
      const _aSide = side === 'atk' ? state.atk : state.def;
      const _dSide = side === 'atk' ? state.def : state.atk;
      if (_aSide && _dSide) {
        const _auto = resolveAutoPowerForSlot(side, i, skillObj);
        if (_auto !== null) slotData.power = _auto;
      }
    }
// 列5：威力
    const powerInput = document.createElement('input');
    powerInput.type = isStatusSkill ? 'text' : 'number';
    powerInput.className = 'fsk-power';
    powerInput.id = `fsk-power-${side}-${i}`;
    if (!isStatusSkill) { powerInput.min = 0; powerInput.max = 9999; }
    powerInput.value = isStatusSkill ? '--' : (slotData ? (slotData.power !== undefined ? slotData.power : (skillObj ? skillObj.p : 0)) : 0);
    powerInput.title = isStatusSkill ? '状态技能，无伤害威力' : '技能威力（可手动修改）';
    powerInput.disabled = isStatusSkill;
    if (isStatusSkill) { powerInput.style.opacity = '0.45'; powerInput.style.textAlign = 'center'; }
    powerInput.oninput = () => {
      if (fullState[side][i]) fullState[side][i].power = Math.max(0, parseInt(powerInput.value) || 0);
      calcFull();
    };
    row.appendChild(powerInput);

    // 列5.5：修正后威力（只读，规则表 + 特性加算 + 乘除段的结果）
    const effPowerSpan = document.createElement('span');
    effPowerSpan.className = 'fsk-power-eff';
    effPowerSpan.id = `fsk-peff-${side}-${i}`;
    effPowerSpan.textContent = isStatusSkill ? '' : '—';
    row.appendChild(effPowerSpan);

    // 列6：备注❓（列5.6 的修正栏要在它之后 append，见行末）
    const remarkTip = document.createElement('span');
    remarkTip.className = 'fsk-tip-icon';
    remarkTip.id = `fsk-tip-${side}-${i}`;
    Object.assign(remarkTip.style, {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: '18px', height: '18px', borderRadius: '50%',
      background: '#444', color: '#fff', fontSize: '12px',
      fontWeight: '700', lineHeight: '1', cursor: 'pointer', position: 'relative'
    });
    const isYuanli = skillObj && skillObj.n.startsWith('愿力冲击');
    const fskTipHtml = skillObj ? getFskPowerTipHTML(skillObj.n) : null;
    if (isYuanli) {
      // 说明性提示（条件勾选已由 data/skillMult.js 的规则渲染在该槽的「本次威力修正」区）
      remarkTip.style.visibility = 'visible';
      remarkTip.innerHTML = `?<span class="fsk-remark-tooltip" style="min-width:200px">
        <div style="font-weight:700;margin-bottom:6px;color:#ce93d8">愿力冲击</div>
        <div style="font-size:11px;color:var(--text2)">双攻技能，取物攻/魔攻较高者。<br>应对状态（目标本回合使用状态技能）时威力×2.5，且必定先手。</div>
      </span>`;
    } else if (fskTipHtml) {
      remarkTip.innerHTML = `?<span class="fsk-remark-tooltip">${fskTipHtml}</span>`;
    } else {
      remarkTip.style.visibility = 'hidden';
      remarkTip.textContent = '?';
    }
    row.appendChild(remarkTip);

    // 列5.6：技能威力条件（内嵌勾选/数字框，整行贯通 width:100%）
    //   ⚠️ 必须放在备注之后 append：它 grid-column:1/-1 独占一行，
    //      若排在备注前面，自动排布会把备注❓挤到它下面的一行（备注列对不齐）
    const condBox = document.createElement('div');
    condBox.className = 'fsk-cond-box';
    condBox.id = `fsk-cond-${side}-${i}`;
    row.appendChild(condBox);

    // 隐藏的伤害/百分比（供 calcFull 使用，放在 row 外避免影响 grid）
    const dmgSpan = document.createElement('span');
    dmgSpan.className = 'fsk-dmg';
    dmgSpan.id = `fsk-dmg-${side}-${i}`;
    const pctSpan = document.createElement('span');
    pctSpan.className = 'fsk-dmg-pct';
    pctSpan.id = `fsk-pct-${side}-${i}`;

    container.appendChild(row);
    container.appendChild(dmgSpan);
    container.appendChild(pctSpan);

    // 行渲染完成后填充技能威力条件区（FULL 模式内嵌）
    if (skillObj && !isStatusSkill) {
      renderPowerCond(skillObj, 'full', `${side}${i}`, condBox);
    }
  }
}

// ── 已搬迁至 js/04-power.js（技能威力条件 / 提示 / FULL 变动威力）──

function openFskDropdown(side, idx) {
  const inputEl = document.getElementById(`fsk-input-${side}-${idx}`);
  const drop = document.getElementById(`fsk-drop-${side}-${idx}`);
  // 框内为空（点击时已清空）或仍是已选技能名（占位显示）→ 视为未选择：展示全量分组列表
  const q = isPickedDisplay(inputEl) ? '' : inputEl.value.trim();
  drop.innerHTML = '';

  const spirit = side === 'atk' ? state.atk : state.def;
  if (!spirit) {
    drop.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:var(--text2)">请先选择精灵</div>';
    drop.classList.add('open');
    return;
  }

  const allSkills = SKILLS.map(s => ({ skill: s }));

  // 过滤
  const filtered = q
    ? filterSkillsByQuery(q).map(sk => ({ skill: sk }))   // 相关度排序，见 js/01-core.js
    : allSkills;

  if (!filtered.length) {
    drop.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:var(--text2)">无匹配技能</div>';
    drop.classList.add('open');
    return;
  }

  let html = '';
  if (!q) {
    // 无输入：按属性分组显示（状态技能单独分组）
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
    // 有输入：扁平列表
    filtered.forEach(e => { html += makeSkillItem(e.skill); });
  }

  drop.innerHTML = html;
  bindSkillGroupToggle(drop);
  drop.querySelectorAll('.skill-lib-item').forEach(item => {
    item.addEventListener('mousedown', e => {
      e.preventDefault();
      const sk = SKILLS.find(s => s.n === item.dataset.name);
      if (sk) selectFskSkill(side, idx, sk);
    });
  });
  drop.classList.add('open');
  // 每次展开都回到顶部：不保留上次的滚动位置
  drop.scrollTop = 0;
}

function closeFskDropdown(side, idx) {
  const drop = document.getElementById(`fsk-drop-${side}-${idx}`);
  if (drop) drop.classList.remove('open');
}

function selectFskSkill(side, idx, sk) {
  // 选完即失焦（该行随后会整体重建，这里显式失焦以保证 activeElement 不留在框内）
  const prevInput = document.getElementById(`fsk-input-${side}-${idx}`);
  if (prevInput) prevInput.blur();
  fullState[side][idx] = { skill: sk, hits: skillDefaultHits(sk), power: sk.p };
  buildFullSkillRows(side);
  calcFull();
}

function selectFullSkill(side, idx) {
  fullState[side + 'Sel'] = idx;  // 始终选中，不 toggle
  updateStarMarksFullState();
  buildFullSkillRows(side);
  buildFullSkillRows(side === 'atk' ? 'def' : 'atk');
  renderFullResult();
}

// 计算单个技能伤害（完整模式）
function calcOneFskDmg(atkSpirit, defSpirit, skillSlot) {
  if (!atkSpirit || !defSpirit || !skillSlot || !skillSlot.skill) return null;
  const sk = skillSlot.skill;
  // 状态技能不参与伤害计算
  if (sk.k === '状态') return { isStatus: true, skillName: sk.n };
  // 双攻技能：取攻击方物攻/魔攻较高一项
  const isPhys = sk.k === '双攻'
    ? ((atkSpirit.patk || atkSpirit.pa || 0) >= (atkSpirit.matk || atkSpirit.ma || 0))
    : sk.k === '物攻';
  // 愿力冲击：技能名带属性后缀（如 愿力冲击(火)），用前缀匹配识别
  // 威力×2.5 与「应对状态」条件已由 data/skillMult.js 的规则统一处理（走 pw.powerMult）
  const isYuanliSkill = sk.n.startsWith('愿力冲击');
  const atkBaseRaw = atkSpirit[isPhys ? 'patk' : 'matk'] || atkSpirit.pa || atkSpirit.ma;
  const defBaseRaw = defSpirit[isPhys ? 'pdef' : 'mdef'] || defSpirit.pd || defSpirit.md;
  // 能级倍率：按精灵身份 × 当前角色（攻/防）分别取对应等级
  // atkSpirit 出手：取其「攻击能力等级」
  // defSpirit 被打：取其「防御能力等级」
  const atkLvMult = levelMult(atkSpirit === state.atk ? state.atkAtkLevel : state.defAtkLevel);
  const defLvMult = levelMult(defSpirit === state.def ? state.defDefLevel : state.atkDefLevel);
  const defHp = defSpirit.real_hp || defSpirit.hp;

  // 技能属性克制
  const typeEff = getTypeEff(sk.a || '', defSpirit.a1, defSpirit.a2 || '');
  // 本系加成
  const stabMult = hasStab(atkSpirit, sk.a || '') ? 1.25 : 1.0;
  // 减伤
  const reducePct = parseFloat(document.getElementById('def-reduce-full').value) || 0;
  const reduceMult = 1 - Math.min(99, Math.max(0, reducePct)) / 100;
  // 特性倍率 + 额外倍率
  // 条件选项必须**按精灵所属侧**读取：特性条件输入框挂在 state.atk / state.def 面板上，
  //   而本函数按方向传参（方向2 时 atkSpirit 其实是 state.def）。
  //   ⚠️ 曾经用 readTraitOptsByMode('full')（无 side：只读攻方面板）并把同一份 opts
  //      同时喂给攻方/防方两条规则 —— 两侧若都有同类条件（如都用 stackCount），
  //      防方规则会读到攻方的次数。与模式 B 的逐侧读取对齐。
  const _atkTraitSide = atkSpirit === state.def ? 'def' : 'atk';
  const _defTraitSide = defSpirit === state.def ? 'def' : 'atk';
  const _traitOptsAtk = readTraitOptsByMode('full', _atkTraitSide);
  const _traitOptsDef = readTraitOptsByMode('full', _defTraitSide);
  // 冰钻：按对手技能槽总能耗自动注入（只注入攻方侧规则）
  if (atkSpirit && atkSpirit.tr === '冰钻') {
    let _defCost = 0;
    fullState[_defTraitSide].forEach(slot => { if (slot && slot.skill) _defCost += (slot.skill.c || 0); });
    if (_defCost > 0) _traitOptsAtk.enemyTotalCost = _defCost;
  }
  const _atkTrCalc = calcAtkTraitMult(atkSpirit, defSpirit, sk, _traitOptsAtk);
  const _defTrCalc = calcDefTraitMult(atkSpirit, defSpirit, sk, _traitOptsDef);
  const _atkTrMult = _atkTrCalc.mult;
  const _defTrMult = _defTrCalc.mult;
  const traitMult = _atkTrMult * _defTrMult;
  const _atkTrMultFinal = _atkTrMult, _defTrMultFinal = _defTrMult;
  const extraMult = parseFloat(document.getElementById('extra-mult-full').value) || 1;

  // 特性攻防属性加成（stat 通道）：侧向生效，物攻技能只吃 patk/pdef
  const buffsRaw = collectStatBuffs(_atkTrCalc.stat, isPhys, 'atk');
  const defBuffsRaw = collectStatBuffs(_defTrCalc.stat, isPhys, 'def');
  // 叠加界面输入（特性攻击倍率 / 特性攻击 / 特性防御倍率 / 特性防御）
  // ⚠️ 数值输入框只在「精灵角色 == 面板归属侧」时才采信：
  //    atk 面板的那个输入框语义是「该侧精灵的攻击倍率」，def 面板的是「该侧精灵的防御倍率」。
  //    方向2（防方出手）时两侧角色互换 —— 此时拿面板输入会把「防御倍率」当成「攻击倍率」，
  //    因此该方向一律只取规则值（没有对应角色的输入框可覆盖）。
  const _atkIn = (atkSpirit === state.atk)
    ? readTraitInputs('full', 'atk', atkSpirit ? atkSpirit.tr : null, _atkTrCalc, buffsRaw)
    : { atkMult: buffsRaw.pctMult, atkAdd: buffsRaw.flatSum };
  const _defIn = (defSpirit === state.def)
    ? readTraitInputs('full', 'def', defSpirit ? defSpirit.tr : null, _defTrCalc, defBuffsRaw)
    : { atkMult: defBuffsRaw.pctMult, atkAdd: defBuffsRaw.flatSum };
  const atkBuffs = { pctMult: _atkIn.atkMult, flatSum: _atkIn.atkAdd, sources: mergeBuffSourcesList(buffsRaw) };
  const defBuffs = { pctMult: _defIn.atkMult, flatSum: _defIn.atkAdd, sources: mergeBuffSourcesList(defBuffsRaw) };

  // ── 技能威力规则（data/skillMult.js）──
  // 变动威力（闪击/鸣沙陷阱/冰锋横扫/魔能爆/怨力打击/钢钻）在此统一解析，
  // 不再散落 if 硬编码。先定位本槽在 fullState 中的位置以读取其条件输入。
  const slotRef = findFullSlotRef(skillSlot);
  let powerBase = (skillSlot.power !== undefined ? skillSlot.power : sk.p) || 0;
  let pw = { powerAdd: 0, powerPct: 0, powerMult: 1, hitsSet: null, label: '', hasRule: false, unimplemented: false };
  if (slotRef) {
    const auto = resolveAutoPowerForSlot(slotRef.side, slotRef.idx, sk);
    if (auto !== null) { powerBase = auto; skillSlot.power = auto; }
    pw = resolveSkillPower(sk, buildFullPowerCtx(slotRef.side, slotRef.idx, sk));
  }

  // 连击数：规则可覆盖（如「应对状态→6连击」）
  const hits = pw.hitsSet || skillSlot.hits || 1;
  if (pw.hitsSet && skillSlot.hits !== pw.hitsSet) skillSlot.hits = pw.hitsSet;

  // 特性威力加算（蒸汽膨胀 +10/次、蒸汽革命 +10）与技能固定修正同权进入威力基数
  //   ⚠️ 只取**本方向出手方**的 ATK 侧规则（_atkTrCalc）与该侧面板的输入框：
  //      方向2（防方出手）时 _atkTraitSide === 'def'，读防方面板才对得上；
  //      受击方（_defTrCalc，DEF_TRAIT_RULES 只产出 f / stat）的威力通道恒为 0，
  //      叠加它会让「蒸汽膨胀」这类只增强自身出招的特性平白加到别人的伤害上。
  const traitPowerBonus = traitInputEffective('powerAdd', 'full', _atkTraitSide, _atkTrCalc.powerBonus || 0);
  // 特性威力倍率：规则值（powerPct 已在 calcAtkTraitMult 内折算进 powerMult）；
  //   手动改过「特性威力倍率」输入框时以输入框为权威值
  const traitPowerMult = traitInputEffective('powerMult', 'full', _atkTraitSide, _atkTrCalc.powerMult || 1);
  const res = computeDamage({
    atkBase: atkBaseRaw, defBase: defBaseRaw,
    useLevel: true,
    atkFlat: atkBuffs.flatSum, atkPctMult: atkBuffs.pctMult, atkLevelMult: atkLvMult,
    defFlat: defBuffs.flatSum, defPctMult: defBuffs.pctMult, defLevelMult: defLvMult,
    powerBase,
    powerMult: pw.powerMult,           // 应对倍率（技能侧；愿力冲击「应对状态→×2.5」也在此）
    powerTraitMult: (traitPowerMult || 1),  // 特性威力倍率
    powerPct: pw.powerPct,             // 本次威力 +N%
    powerAdd: pw.powerAdd,             // 技能威力加成
    powerTraitBonus: traitPowerBonus,  // 特性威力加成
    typeEff, stab: stabMult, traitMult, extraMult, reduceMult, hits,
  });
  const dmg = res.dmg;
  const pct = defHp > 0 ? dmg / defHp * 100 : 0;

  // ── 星陨伤害（幻系技能不触发）──
  const isPhantom = (sk.a || '') === '幻';
  const starMarks = isPhantom ? 0 : Math.max(0, Math.min(100,
    parseInt((document.getElementById('star-marks-full') || {}).value) || 0));
  let starDmg = 0, starPower = 0;
  if (starMarks > 0) {
    starPower = starMarks * starMarks + 24 * starMarks - 24;
    const starTypeEff = getTypeEff('幻', defSpirit.a1, defSpirit.a2 || '');
    // 星陨为独立追加伤害：不吃攻防特性与额外倍率（与 A/B 公式对齐）
    starDmg = Math.floor((res.attackValue / res.defenseValue) * (37/41) * starPower * starTypeEff * reduceMult);
  }
  const totalDmg = dmg + starDmg;
  const totalPct = defHp > 0 ? totalDmg / defHp * 100 : 0;

  return { dmg, pct, totalDmg, totalPct, typeEff, stabMult, reduceMult, extraMult, power: res.powerFinal, hits, isPhys,
           starMarks, starPower, starDmg, starPct: defHp > 0 ? starDmg / defHp * 100 : 0,
           // yuanliBoost：愿力冲击「应对状态」是否生效（由规则给出的乘算值反推，替代旧的 slot 标志位）
           isYuanliSkill, yuanliBoost: !!(isYuanliSkill && pw.powerMult !== 1), atkTrMult: _atkTrMultFinal, defTrMult: _defTrMultFinal,
           // 四层拆解所需数据（供 renderFullResult / 明细面板复用同一渲染函数）
           layers: { res, pw, atkBuffs, defBuffs, atkLevelMult: atkLvMult, defLevelMult: defLvMult,
                     atkBase: atkBaseRaw, defBase: defBaseRaw,
                     traitPowerBonus, atkTraitPowerPct: 0,
                     atkTraitMult: _atkTrMultFinal, defTraitMult: _defTrMultFinal },
           slotRef: slotRef ? { side: slotRef.side, idx: slotRef.idx } : null };
}

// 在 fullState 中按对象引用反查技能槽位置（用于读取该槽的威力条件输入）
function findFullSlotRef(skillSlot) {
  if (typeof fullState === 'undefined' || !skillSlot) return null;
  for (const side of ['atk', 'def']) {
    for (let i = 0; i < fullState[side].length; i++) {
      if (fullState[side][i] === skillSlot) return { side, idx: i };
    }
  }
  return null;
}

// FULL 模式：按当前攻方选中技能禁用/恢复星陨印记输入框（与 A/B 行为对齐，仅 UI 状态，不影响数值）
function updateStarMarksFullState() {
  const el = document.getElementById('star-marks-full');
  if (!el) return;
  let skill = null;
  if (typeof fullState !== 'undefined') {
    const selIdx = fullState.atkSel >= 0 ? fullState.atkSel : 0;
    for (let i = selIdx; i < 4; i++) {
      if (fullState.atk[i] && fullState.atk[i].skill) { skill = fullState.atk[i].skill; break; }
    }
  }
  const isPhantom = !!(skill && (skill.a || '') === '幻');
  el.disabled = isPhantom;
  el.title = isPhantom ? '幻系技能不触发星陨印记' : '';
  el.style.opacity = isPhantom ? '0.4' : '';
}

function calcFull() {
  if (!state.atk || !state.def) return;
  // 每次计算前先刷新特性面板（渲染条件框、更新倍率显示），避免循环调用时用标志位保护
  if (!calcFull._updating) {
    calcFull._updating = true;
    autoUpdateTraitUI();
    calcFull._updating = false;
  }
  updateStarMarksFullState();

  // 更新精灵名
  const atkNameEl = document.getElementById('full-atk-name');
  const defNameEl = document.getElementById('full-def-name');
  if (atkNameEl) atkNameEl.textContent = state.atk.n;
  if (defNameEl) defNameEl.textContent = state.def.n;

  // 计算攻击方打防御方
  ['atk', 'def'].forEach(side => {
    const atkSp = side === 'atk' ? state.atk : state.def;
    const defSp = side === 'atk' ? state.def : state.atk;
    for (let i = 0; i < 4; i++) {
      const res = calcOneFskDmg(atkSp, defSp, fullState[side][i]);
      const dmgEl = document.getElementById(`fsk-dmg-${side}-${i}`);
      const pctEl = document.getElementById(`fsk-pct-${side}-${i}`);
      if (dmgEl) dmgEl.textContent = res ? (res.isStatus ? '—' : f1(res.dmg)) : '—';
      if (pctEl) pctEl.textContent = res && !res.isStatus ? res.pct.toFixed(1) + '%' : '';
      // 「修正后威力」只读列：显示规则表 + 特性加算 + 乘除段后的结果
      const peEl = document.getElementById(`fsk-peff-${side}-${i}`);
      if (peEl) {
        if (!res || res.isStatus) { peEl.textContent = ''; peEl.className = 'fsk-power-eff'; }
        else {
          // 口径：威力 = (基础威力区 + 固定威力提升区) × 技能威力乘区
          const _pr = res.layers.res;
          const _pCore = _pr.powerSkill * _pr.powerCounter;                      // 基础威力区
          const _pBase = _pr.powerSkill + _pr.powerFlatAll;                      // 无任何倍率时的威力
          peEl.textContent = f1(_pr.powerFinal);
          peEl.className = 'fsk-power-eff' + (_pr.powerFinal !== _pBase ? ' is-effected' : '');
          peEl.title = '技能威力 ' + f1(_pr.powerSkill)
            + (_pr.powerCounter !== 1 ? ' ×应对' + f2(_pr.powerCounter) : '')
            + (_pr.powerFlatAll !== 0 ? ' +固定提升' + (_pr.powerFlatAll > 0 ? '+' : '') + f1(_pr.powerFlatAll) : '')
            + ' → ' + f1(_pCore + _pr.powerFlatAll)
            + (_pr.powerMultAll !== 1 ? ' ×乘区' + f2(_pr.powerMultAll) : '')
            + ' = ' + f1(_pr.powerFinal)
            + (res.layers.pw && res.layers.pw.label ? '\n' + res.layers.pw.label : '');
        }
      }
      // 本次威力修正的只读链路：FULL 行不会重建，条件改动后必须在这里刷新
      if (fullState[side][i] && fullState[side][i].skill) {
        updatePowerChain(fullState[side][i].skill, 'full', `${side}${i}`);
      }
    }
  });

  renderFullResult();

  // 刷新特性攻防加成区（与 calc() 模式 B 同理：勾选框渲染完后再刷一次）
  {
    const _sk = (state.atk && fullState.atk.find(function(sl){ return sl && sl.skill && sl.skill.k !== '状态'; }))
      ? fullState.atk.find(function(sl){ return sl && sl.skill && sl.skill.k !== '状态'; }).skill
      : null;
    refreshStatAreas('full', _sk);
  }
}

function renderFullResult() {
  const rp = document.getElementById('full-result-panel');
  if (!rp) return;
  if (!state.atk || !state.def) return;

  const atkSel = fullState.atkSel;
  const defSel = fullState.defSel;

  // 构建左右技能列表
  function buildResultSide(side, label, color) {
    const atkSp = side === 'atk' ? state.atk : state.def;
    const defSp = side === 'atk' ? state.def : state.atk;
    const defHp = defSp.real_hp || defSp.hp;
    const selIdx = fullState[side + 'Sel'];
    let rows = '';

    for (let i = 0; i < 4; i++) {
      const res = calcOneFskDmg(atkSp, defSp, fullState[side][i]);
      const skName = fullState[side][i] ? fullState[side][i].skill.n : `技能${i+1}`;
      const isStatus = res && res.isStatus;
      const pct = (res && !isStatus) ? res.totalPct : 0;
      const barW = (res && !isStatus) ? Math.min(100, res.totalPct).toFixed(1) : 0;
      const pctColor = pct >= 50 ? '#ef5350' : pct >= 25 ? '#ffa726' : '#66bb6a';
      const isSel = selIdx === i;
      rows += `
        <div class="frs-row${isSel ? ' selected' : ''}" onclick="selectFullSkill('${side}', ${i})">
          <span class="frs-name" style="font-weight:${isSel?'700':'500'}">${skName}</span>
          <div class="frs-bar-wrap"><div class="frs-bar" style="width:${barW}%;background:${color}"></div></div>
          <span class="frs-pct" style="color:${(res && !isStatus) ? pctColor : 'var(--text2)'}">${isStatus ? '<span style="color:var(--text2);font-size:11px">状态</span>' : (res ? pct.toFixed(1)+'%' : '—')}</span>
        </div>`;
    }
    return `
      <div class="full-result-side">
        <div class="full-result-side-title" style="color:${color}">${label}</div>
        ${rows}
      </div>`;
  }

  const atkColor = 'var(--atk-color)';
  const defColor = 'var(--def-color)';
  let detailHtml = '';

  // 当前选中技能的详细面板
  const selSide = atkSel >= 0 ? 'atk' : (defSel >= 0 ? 'def' : null);
  const selIdx = selSide ? fullState[selSide + 'Sel'] : -1;
  if (selSide !== null && selIdx >= 0) {
    const atkSp = selSide === 'atk' ? state.atk : state.def;
    const defSp = selSide === 'atk' ? state.def : state.atk;
    const res = calcOneFskDmg(atkSp, defSp, fullState[selSide][selIdx]);
    if (res && res.isStatus) {
      const sk = fullState[selSide][selIdx].skill;
      detailHtml = `
        <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:14px">
          <div style="font-size:11px;color:var(--text2);margin-bottom:10px;display:flex;align-items:center;gap:6px">
            ${atkSp.n} <span style="font-size:13px">→</span> ${defSp.n}
            <b style="color:var(--text)">${sk.n}</b>
            <span style="background:rgba(128,203,196,.15);color:#80cbc4;border:1px solid rgba(128,203,196,.35);font-size:10px;padding:1px 8px;border-radius:8px">状态技能</span>
          </div>
          <div style="text-align:center;padding:18px;color:var(--text2);font-size:13px">
            「${sk.n}」是状态技能，不造成直接伤害
          </div>
        </div>`;
    } else if (res) {
      const defHp = defSp.real_hp || defSp.hp;
      const barW = Math.min(100, res.pct).toFixed(1);
      const barCls = res.pct >= 50 ? 'fill-red' : res.pct >= 25 ? 'fill-yellow' : 'fill-green';
      const pctColor = res.totalPct >= 50 ? '#ef5350' : res.totalPct >= 25 ? '#ffa726' : '#66bb6a';
      const sk = fullState[selSide][selIdx].skill;
      const asLabel = res.isPhys ? '物攻' : '魔攻';
      const dsLabel = res.isPhys ? '物防' : '魔防';
      // 原始属性（不含能级）
      const atkBaseRaw = atkSp[res.isPhys ? 'patk' : 'matk'] || atkSp.pa || atkSp.ma;
      const defBaseRaw = defSp[res.isPhys ? 'pdef' : 'mdef'] || defSp.pd || defSp.md;
      // 能级
      const atkLv = atkSp === state.atk ? state.atkAtkLevel : state.defAtkLevel;
      const defLv = defSp === state.def ? state.defDefLevel : state.atkDefLevel;
      const atkLvM = levelMult(atkLv);
      const defLvM = levelMult(defLv);
      const atkBase = atkBaseRaw * atkLvM;
      const defBase = defBaseRaw * defLvM;
      // 愿力冲击双攻标注
      const yuanliTag = res.isYuanliSkill
        ? `<span class="eff-tag" style="background:rgba(206,147,216,.2);color:#ce93d8;border:1px solid rgba(206,147,216,.4)">${res.isPhys?'物攻':'魔攻'}（取较高）</span>`
          + (res.yuanliBoost ? `<span class="eff-tag" style="background:rgba(255,167,38,.2);color:#ffa726;border:1px solid rgba(255,167,38,.4)">对手用状态技能 威力×2.5</span>` : '')
        : '';

      let effLabel = '', effCls = '';
      if (res.typeEff >= 3) { effLabel = '双重克制 ×3'; effCls = 'eff-4x'; }
      else if (res.typeEff === 2) { effLabel = '克制 ×2'; effCls = 'eff-2x'; }
      else if (res.typeEff <= 0.25) { effLabel = '双重抵抗 ×0.25'; effCls = 'eff-025x'; }
      else if (res.typeEff < 1) { effLabel = '抵抗 ×0.5'; effCls = 'eff-05x'; }
      else { effLabel = '普通效果'; effCls = 'eff-1x'; }

      const atkLvStr = atkLv >= 0 ? '+' + atkLv : '' + atkLv;
      const defLvStr = defLv >= 0 ? '+' + defLv : '' + defLv;
      // 公式串：威力处直接填「最终威力」(powerFinal)，与游戏口径一致；
      //   (基础威力区 + 固定威力提升区) × 技能威力乘区 的分解见拆解面板的「威力层」。
      const L = res.layers;
      const formulaStr = `(${f1(L.res.attackValue)} / ${f1(L.res.defenseValue)}) × 37/41 × ${f1(L.res.powerFinal)}`
        + (res.typeEff !== 1 ? ` × ${res.typeEff}(克制)` : '')
        + (res.stabMult > 1 ? ` × 1.25(本系)` : '')
        + (res.atkTrMult && res.atkTrMult !== 1 ? ` × ${f2(res.atkTrMult)}(攻方特性)` : '')
        + (res.defTrMult && res.defTrMult !== 1 ? ` × ${f2(res.defTrMult)}(防方特性)` : '')
        + (res.extraMult && res.extraMult !== 1 ? ` × ${res.extraMult}(其他)` : '')
        + (res.reduceMult < 1 ? ` × ${f2(res.reduceMult)}(减伤)` : '')
        + (res.hits > 1 ? ` × ${res.hits}连击` : '')
        + ` = ${f1(res.dmg)}`;

      // 星陨部分
      const starSection = res.starMarks > 0 ? `
        <div style="margin-top:10px;padding:8px 10px;background:rgba(206,147,216,.08);border:1px solid rgba(206,147,216,.25);border-radius:8px">
          <div style="font-size:11px;color:#ce93d8;font-weight:700;margin-bottom:6px">⭐ 星陨追加伤害（${res.starMarks}层 · 幻系 ${asLabel}）</div>
          <div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;margin-bottom:6px">
            <span style="font-size:24px;font-weight:900;color:#ce93d8">${f1(res.starDmg)}</span>
            <span style="font-size:12px;color:var(--text2)">星陨伤害</span>
            <span style="font-size:13px;font-weight:700;color:#ce93d8">${res.starPct.toFixed(1)}%</span>
            <span style="font-size:11px;background:rgba(206,147,216,.18);color:#ce93d8;border:1px solid rgba(206,147,216,.35);padding:1px 8px;border-radius:8px">威力 ${res.starPower}</span>
          </div>
          <div class="hp-bar-track" style="margin-bottom:6px">
            <div class="hp-bar-fill" style="width:${Math.min(100, res.starPct).toFixed(1)}%;background:linear-gradient(90deg,#9c27b0,#ce93d8)"></div>
            <span class="hp-pct">${res.starPct.toFixed(1)}%</span>
          </div>
          <div style="font-size:10px;color:var(--text2)">
            威力 = ${res.starMarks}²+24×${res.starMarks}−24 = ${res.starPower} &nbsp;|&nbsp;
            合计伤害：<b style="color:var(--text)">${f1(res.totalDmg)}</b>（HP <b style="color:${pctColor}">${res.totalPct.toFixed(1)}%</b>）
          </div>
        </div>` : '';

      detailHtml = `
        <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:14px">
          <div style="font-size:11px;color:var(--text2);margin-bottom:6px;display:flex;align-items:center;gap:6px">
            ${atkSp.n} <span style="font-size:13px">→</span> ${defSp.n}
            <b style="color:var(--text)">${sk.n}</b>
            <span class="eff-tag ${effCls}">${effLabel}</span>
            ${res.stabMult > 1 ? '<span class="eff-tag" style="background:rgba(255,200,0,.25);color:#ffd700;border:1px solid rgba(255,200,0,.4)">本系 ×1.25</span>' : ''}
            ${yuanliTag}
          </div>
          <div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;margin-bottom:10px">
            <span style="font-size:32px;font-weight:900;color:var(--text)">${f1(res.dmg)}</span>
            <span style="font-size:13px;color:var(--text2)">伤害</span>
            <span style="font-size:16px;font-weight:700;color:${pctColor}">${res.pct.toFixed(1)}%</span>
          </div>
          <div class="hp-section">
            <div class="hp-header">
              <span>${defSp.n} HP：<b>${defHp}</b></span>
              <span style="font-weight:700;color:${pctColor}">${res.pct.toFixed(1)}%</span>
            </div>
            <div class="hp-bar-track">
              <div class="hp-bar-fill ${barCls}" style="width:${barW}%"></div>
              <span class="hp-pct">${res.pct.toFixed(1)}%</span>
            </div>
          </div>
          ${starSection}
          <div class="breakdown" style="margin-top:10px">
            ${renderLayersHtml({
              mode: 'FULL', res: L.res, pw: L.pw,
              atkBase: L.atkBase, defBase: L.defBase,
              atkBuffs: L.atkBuffs, defBuffs: L.defBuffs,
              atkPctMult: L.atkBuffs.pctMult, defPctMult: L.defBuffs.pctMult,
              atkFlat: L.atkBuffs.flatSum, defFlat: L.defBuffs.flatSum,
              atkMult: L.atkLevelMult, defMult: L.defLevelMult,
              asLabel: asLabel, dsLabel: dsLabel,
              atkLvSuffix: atkLv !== 0 ? `（等级${atkLvStr}）` : '',
              defLvSuffix: defLv !== 0 ? `（等级${defLvStr}）` : '',
              typeEff: res.typeEff, stabMult: res.stabMult,
              atkTraitMult: L.atkTraitMult, defTraitMult: L.defTraitMult,
              extraMult: res.extraMult, reducePct: Math.round((1 - res.reduceMult) * 100), reduceMult: res.reduceMult,
              hits: res.hits, dmg: res.dmg,
              atkTraitPowerPct: L.atkTraitPowerPct, traitPowerShown: L.traitPowerBonus,
            })}
          </div>
          <div class="formula-row">${formulaStr}</div>
        </div>`;
    }
  }

  rp.innerHTML = `
    <div class="full-result-header">${state.atk.n} vs ${state.def.n} — 点击技能查看详细伤害</div>
    <div class="full-result-grid">
      ${buildResultSide('atk', '⚔️ ' + state.atk.n + ' 的技能（打 ' + state.def.n + '）', 'var(--atk-color)')}
      ${buildResultSide('def', '🛡️ ' + state.def.n + ' 的技能（打 ' + state.atk.n + '）', 'var(--def-color)')}
    </div>
    ${detailHtml}`;
}

