// js/04-power.js — 技能威力桥接层：条件框渲染/读取、powerCtx 构建、浮动威力提示、FULL 变动威力解析
// 加载顺序位次 4：依赖 js/01（查表常量）/ js/02（buildPowerUtil）/ js/03（特性倍率）与 data/skillMult.js 规则表。
// 规则表内不碰 DOM，全部经 buildPowerUtil 注入的 ctx.util；本文件自身只做 DOM 读写。
// 运行时前向引用（合法）：calc / calcFull / findFullSlotRef 仍在 index.html 行内脚本，调用期才解析。
// 读取技能威力条件选项
function readPowerOptsByMode(mode, slot) {
  const opts = {};
  const prefix = `pwr-opt-${mode}-${slot}-`;
  document.querySelectorAll('[id^="' + prefix + '"]').forEach(el => {
    const key = el.id.slice(prefix.length);
    if (!key) return;
    if (el.type === 'checkbox') opts[key] = el.checked;
    else opts[key] = parseInt(el.value) || 0;
  });
  return opts;
}

// 取某一侧精灵的特性威力结果（供威力修正栏使用）
//   mode: 'b' | 'full'；side: 'atk' | 'def'；skill: 用于特性规则的上下文
//   返回 { trName, channels, affectsPower, powerMult, powerAdd }
//   ⚠️ affectsPower 取自TRAIT_CHANNELS 的**静态声明**，
//      因此「蒸汽膨胀」这类特性即使层数为 0，威力修正栏仍会展示。
function traitPowerFor(mode, side, skill) {
  const spirit = side === 'atk' ? state.atk : state.def;
  const foe = side === 'atk' ? state.def : state.atk;
  const trName = spirit ? spirit.tr : null;
  const channels = getTraitChannelsForSide(trName, side);
  const affectsPower = !!(channels && (channels.pwM || channels.pwA));
  let res = null;
  if (spirit && skill) {
    const opts = readTraitOptsByMode(mode, side);
    res = (side === 'atk')
      ? calcAtkTraitMult(spirit, foe, skill, opts)
      : calcDefTraitMult(spirit, foe, skill, opts);
  }
  const buffs = collectStatBuffs(res && res.stat, state.atkStat === 'patk', side);
  const inp = readTraitInputs(mode, side, trName, res, buffs);
  return {
    trName, channels, affectsPower,
    powerMult: inp.powerMult,
    powerAdd: inp.powerAdd,
    desc: (spirit && spirit.tr_desc) || '',
  };
}

// 渲染技能威力条件字段到容器
//   mode: 'b' | 'full'；slot: 'b' | `${side}${i}`
function renderPowerCond(skill, mode, slot, container) {
  if (!container) return;
  if (!skill) { container.innerHTML = ''; delete container.dataset.pwrSig; return; }

  const fields = getSkillPowerFields(skill);
  // 威力修正栏在「技能有威力修正」或「特性影响威力」任一成立时展示
  const side = (mode === 'b') ? 'atk' : (String(slot).indexOf('def') === 0 ? 'def' : 'atk');
  const tp = traitPowerFor(mode, side, skill);
  if (fields.length === 0 && !tp.affectsPower) { container.innerHTML = ''; delete container.dataset.pwrSig; return; }

  // 结构签名：技能 / 字段列表 / 提示状态。结构没变就只刷新链路，不重建输入框 DOM
  //   ⚠️ 模式 B 的 calc() 每次都会调这里；此前无条件重建会让正在输入的输入框被销毁 → 光标丢失
  const sig = [mode, slot, skill.n, tp.affectsPower ? 1 : 0,
    fields.map(f => f.id + ':' + f.type + ':' + (f.def === undefined ? '' : f.def)).join(',')].join('|');
  if (container.dataset.pwrSig === sig && container.firstChild) {
    updatePowerChain(skill, mode, slot);
    return;
  }
  container.dataset.pwrSig = sig;

  // 保留已填值，避免重建时丢失：
  //   模式 B 直接读 DOM；FULL 的行每次重建都会清空容器，故先从槽位数据里取回上次填的值
  const saved = Object.assign({}, fullSlotPwrOpts(slot), readPowerOptsByMode(mode, slot));
  const prefix = `pwr-opt-${mode}-${slot}-`;
  const isAtkSide = side === 'atk';
  const sideColor = isAtkSide ? 'var(--atk-color)' : '#42a5f5';

  let html = `<div class="power-mod-box">`;
  // 标题行：标题 + 条件选项 + 规则说明（说明文本由 updatePowerChain 写入 #pwr-notes-*）
  html += `<div class="power-mod-head">`;
  html += `<span class="power-mod-title" style="color:${sideColor}">⚡ 本次威力修正</span>`;

  if (fields.length > 0) {
    html += `<div class="power-cond-row">`;
    fields.forEach(f => {
      const id = prefix + f.key;
      if (f.type === 'checkbox') {
        const checked = saved.hasOwnProperty(f.key) ? (saved[f.key] ? 'checked' : '') : (f.def ? 'checked' : '');
    html += `<label class="power-cond-ck"><input type="checkbox" id="${id}" ${checked} onchange="onPowerCondChange('${mode}','${slot}')"> ${f.label}</label>`;
      } else {
      const v = saved.hasOwnProperty(f.key) ? saved[f.key] : (f.def === undefined ? 0 : f.def);
        html += `<span class="power-cond-num"><span>${f.label}：</span>`
          + `<input type="number" id="${id}" value="${v}" min="${f.min || 0}" max="${f.max === undefined ? 999 : f.max}"`
          + ` oninput="onPowerCondChange('${mode}','${slot}')"></span>`;
      }
    });
    html += `</div>`;
  }
  html += `<span class="power-mod-notes" id="pwr-notes-${mode}-${slot}" style="display:none"></span>`;
  html += `</div>`;   // power-mod-head 结束

  // 修正链路：技能威力 × 应对倍率 → 基础威力区 ＋ 各项加成 → × 技能威力乘区(整段) → 威力
  html += `<div class="power-chain" id="pwr-chain-${mode}-${slot}"></div>`;
  html += `</div>`;
  container.innerHTML = html;

  updatePowerChain(skill, mode, slot);
}

// 刷新修正链路只读行
//   链路严格对应公式：威力 = (基础威力区 + 固定威力提升区) × 技能威力乘区
function updatePowerChain(skill, mode, slot) {
  const box = document.getElementById(`pwr-chain-${mode}-${slot}`);
  if (!box) return;
  const r = resolveSkillPower(skill, buildPowerCtx(mode, slot, skill));
  const basePower = readBasePower(mode, slot);
  // 特性威力倍率 / 特性威力加成：取该侧特性面板的最终生效值（与攻击层/防御层同一来源）
  const side = (mode === 'b') ? 'atk' : (String(slot).indexOf('def') === 0 ? 'def' : 'atk');
  const tp = traitPowerFor(mode, side, skill);
  const traitPowerMult = tp.powerMult;
  const traitPowerAdd = tp.powerAdd;

  // 口径：威力 = (基础威力区 + 固定威力提升区) × 技能威力乘区
  //   基础威力区     = 基础威力 × 应对倍率（只放大基础威力）
  //   固定威力提升区 = 技能威力加成 + 特性威力加成（求和）
  //   技能威力乘区   = 1 + Σ（技能威力% + 特性威力倍率增量），对前两者之和整体生效
  const baseSeg = basePower * r.powerMult;
  const flatAll = r.powerAdd + traitPowerAdd;
  // 乘区增量：技能「威力+N%」与「特性威力倍率 1.5」都折算成增量后求和
  const pctNames = [];
  if (r.powerPct) pctNames.push(`威力${r.powerPct > 0 ? '+' : ''}${(r.powerPct * 100).toFixed(0)}%`);
  if (traitPowerMult !== 1) pctNames.push(`特性${(traitPowerMult - 1) > 0 ? '+' : ''}${((traitPowerMult - 1) * 100).toFixed(0)}%`);
  const multAll = 1 + r.powerPct + (traitPowerMult - 1);
  const finalP = (baseSeg + flatAll) * multAll;

  let html = '';
  // ── 基础威力区（只吃应对倍率）──
  html += `<span class="pc-item"><span class="pc-k">技能威力</span><span class="pc-v">${f1(basePower)}</span></span>`;
  if (r.powerMult !== 1) {
    html += `<span class="pc-op">×</span><span class="pc-item"><span class="pc-k">应对倍率</span><span class="pc-v">${f2(r.powerMult)}</span></span>`;
    html += `<span class="pc-op">→</span><span class="pc-item"><span class="pc-k">基础威力区</span><span class="pc-v">${f1(baseSeg)}</span></span>`;
  }
  // ── 固定威力提升区（技能 + 特性求和）──
  if (flatAll !== 0) {
    html += `<span class="pc-op">+</span>`;
    if (r.powerAdd) html += `<span class="pc-item"><span class="pc-k">技能加成</span><span class="pc-v" style="color:${r.powerAdd > 0 ? '#66bb6a' : '#ef5350'}">${r.powerAdd > 0 ? '+' : ''}${f1(r.powerAdd)}</span></span>`;
    if (traitPowerAdd) html += `<span class="pc-item"><span class="pc-k">特性威力加成</span><span class="pc-v" style="color:#a5d6a7">+${f1(traitPowerAdd)}</span></span>`;
  }
  // ── 技能威力乘区：对「基础威力区 + 固定威力提升区」整体生效 ──
  if (multAll !== 1) {
    html += `<span class="pc-op">×</span><span class="pc-item"><span class="pc-k">技能威力乘区${pctNames.length ? '(' + pctNames.join(' ') + ')' : ''}</span><span class="pc-v" style="color:#a5d6a7">${f2(multAll)}</span></span>`;
  }
  html += `<span class="pc-op">→</span><span class="pc-item pc-final"><span class="pc-k">威力</span><span class="pc-v">${f1(finalP)}</span></span>`;
  box.innerHTML = html;

  // 规则说明 / 自动连击提示 → 标题行（与条件选项同一行），不再单独占链路下方一行
  const noteEl = document.getElementById(`pwr-notes-${mode}-${slot}`);
  if (noteEl) {
    const notes = [];
    if (r.label) notes.push(r.label);
    if (r.hitsSet) notes.push(`连击数 → ${r.hitsSet}（自动应用）`);
    noteEl.textContent = notes.join(' · ');
    noteEl.style.display = notes.length ? '' : 'none';
  }
}

// 技能威力条件变更 → 重算
function onPowerCondChange(mode, slot) {
  if (mode === 'b') calc();
  else {
    // FULL：行会整体重建，条件值必须落到槽位数据里才不会丢
    const ref = fullSlotBySlotName(slot);
    if (ref) ref.pwrOpts = readPowerOptsByMode(mode, slot);
    calcFull();
  }
}

// FULL 槽位（slot 形如 'atk0' / 'def2'）→ 槽位数据对象；非 FULL 槽位返回 null
function fullSlotBySlotName(slot) {
  const m = /^(atk|def)(\d)$/.exec(String(slot));
  if (!m || typeof fullState === 'undefined' || !fullState[m[1]]) return null;
  return fullState[m[1]][parseInt(m[2], 10)] || null;
}

// 取该 FULL 槽位上次保存的技能威力条件值（供行重建后回填）
function fullSlotPwrOpts(slot) {
  const ref = fullSlotBySlotName(slot);
  return (ref && ref.pwrOpts) ? ref.pwrOpts : {};
}

// 组装 resolveSkillPower 所需的 ctx（含 util 注入）
function buildPowerCtx(mode, slot, skill) {
  const atkS = state.atk, defS = state.def;
  return {
    skAttr: skill ? (skill.a || '') : '',
    skCost: skill ? (skill.c || 0) : 0,
    skKind: skill ? (skill.k || '') : '',
    atk: atkS, def: defS,
    atkA1: atkS ? (atkS.a1 || '') : '',
    atkA2: atkS ? (atkS.a2 || '') : '',
    defA1: defS ? (defS.a1 || '') : '',
    defA2: defS ? (defS.a2 || '') : '',
    opts: readPowerOptsByMode(mode, slot),
    util: buildPowerUtil({
      spdAtk: atkS ? (atkS.real_spd || atkS.sp || 0) : 0,
      spdDef: defS ? (defS.real_spd || defS.sp || 0) : 0,
      pdefAtk: atkS ? (atkS.real_pdef || atkS.pd || 0) : 0,
      pdefDef: defS ? (defS.real_pdef || defS.pd || 0) : 0,
      foeCost: () => (state.def ? fullSideCost('def', state.def) : 0),
    }),
  };
}

// FULL 模式：某方技能槽总能耗
function fullSideCost(side, selfSpirit) {
  if (typeof fullState === 'undefined') return 0;
  const s = selfSpirit === state.def ? 'def' : 'atk';
  return fullState[s].reduce((sum, sl) => sum + (sl && sl.skill ? (sl.skill.c || 0) : 0), 0);
}

// 读取当前模式/槽位的基础威力输入值
function readBasePower(mode, slot) {
  if (mode === 'b') {
    const el = document.getElementById('base-power-b');
    return el ? (parseFloat(el.value) || 0) : 0;
  }
  const el = document.getElementById(`fsk-power-${slot.replace(/^([a-z]+)(\d+)$/, '$1-$2')}`);
  return el ? (parseFloat(el.value) || 0) : 0;
}

// ============================================================
// VARIABLE POWER TIP  （浮动威力提示）
// ============================================================


// 统一样式助手
function tipWrap(icon, title, body) {
  return `<div style="font-weight:700;margin-bottom:5px;color:var(--text)">${icon} ${title}</div>${body}`;
}
function tipTable(headers, rows) {
  const th = headers.map(h=>`<th style="padding:1px 8px;text-align:left;color:var(--text2)">${h}</th>`).join('');
  const tr = rows.map(([cells, active])=>{
    const tds = cells.map((c,i)=>`<td style="padding:1px 8px;color:${active?(i===cells.length-1?'#c8960a':'var(--text)'):'var(--text2)'}">${c}</td>`).join('');
    return `<tr style="${active?'background:rgba(255,200,80,.18);font-weight:700':''}">${tds}</tr>`;
  }).join('');
  return `<table style="border-collapse:collapse;font-size:11px;margin-top:4px"><tr>${th}</tr>${tr}</table>`;
}
function tipNote(text) {
  return `<div style="color:var(--text2);font-size:11px;margin-top:4px">${text}</div>`;
}
function tipInfo(html) {
  return `<div style="color:var(--text);line-height:1.7;margin-bottom:2px">${html}</div>`;
}

// 把技能的特殊机制提示（威力/血量/能量等）写进「已选：XX」后的备注图标里。
//   · 内容与 FULL 模式「备注」列同源（getFskPowerTipHTML），悬停展示 / 移开隐藏由 CSS :hover 控制
//   · 无提示的技能隐藏图标；部分提示依赖当前面板值，故每次调用都重新生成
function updatePowerTip() {
  const info = document.getElementById('skill-selected-info');
  const icon = info ? info.querySelector('.skill-tip-icon') : null;
  if (!icon) return;
  const tipEl = icon.querySelector('.skill-tooltip');
  const html = getFskPowerTipHTML(state.selectedSkillName);
  if (!html) {
    icon.style.display = 'none';
    if (tipEl) tipEl.innerHTML = '';
    return;
  }
  icon.style.display = '';
  if (tipEl) tipEl.innerHTML = html;
}

// 纯函数：根据技能名返回浮动威力提示 HTML，无浮动时返回 null
function getFskPowerTipHTML(n) {
  // ── 辅助：读实战面板值 ──────────────────────────────────────
  const panelVal = id => parseInt((document.getElementById(id)||{}).textContent) || 0;

  // ── 1. 闪击 ─────────────────────────────────────────────────
  if (n === '闪击') {
    const atkV = panelVal('val-atk-spd'), defV = panelVal('val-def-spd');
    const { p, diff } = diffTableLookup(SPEED_DIFF_TABLE, atkV, defV);
    const rows = SPEED_DIFF_TABLE.map(row => {
      const active = diff >= row.min && diff <= row.max;
      return [[row.label, row.p], active];
    });
    return tipWrap('⚡','闪击：速度差决定威力',
      tipInfo(`攻方速度 <b style="color:#ffd970">${atkV}</b> − 防方速度 <b style="color:#80c8ff">${defV}</b> = <b style="color:${diff>=0?'#80e080':'#ff7070'}">${diff}</b> → 威力 <b style="color:#ffd970;font-size:14px">${p}</b>`) +
      tipTable(['速度差','威力'], rows)
    );
  }

  // ── 2. 鸣沙陷阱 ──────────────────────────────────────────────
  if (n === '鸣沙陷阱') {
    const atkV = panelVal('val-atk-pdef'), defV = panelVal('val-def-pdef');
    const { p, diff } = diffTableLookup(PDEF_DIFF_TABLE, atkV, defV);
    const rows = PDEF_DIFF_TABLE.map(row => {
      const active = diff >= row.min && diff <= row.max;
      return [[row.label, row.p], active];
    });
    return tipWrap('🏔️','鸣沙陷阱：物防差决定威力',
      tipInfo(`攻方物防 <b style="color:#ffd970">${atkV}</b> − 防方物防 <b style="color:#80c8ff">${defV}</b> = <b style="color:${diff>=0?'#80e080':'#ff7070'}">${diff}</b> → 威力 <b style="color:#ffd970;font-size:14px">${p}</b>`) +
      tipTable(['物防差','威力'], rows)
    );
  }

  // ── 3. 魔能爆 ────────────────────────────────────────────────
  if (n === '魔能爆') {
    const rows = MANA_BURST_TABLE.map(([e,p]) => [[`${e} 能量`, p], false]);
    return tipWrap('✨','魔能爆：消耗所有能量，威力随能量变化',
      tipInfo('使用时消耗所有能量，<b>请根据当前能量手动填入威力</b>') +
      tipTable(['当前能量','威力'], rows)
    );
  }

  // ── 4. 位置加成技能 ──────────────────────────────────────────
  const positionSkills = {
    '钢铁洪流': { base:70, bonus:90, trigger:'1号位', max:160, note:'传动2' },
    '械斗':     { base:45, bonus:60, trigger:'1号位', max:105, note:'传动1' },
    '离子震荡': { base:90, bonus:40, trigger:'3号位', max:130, note:'传动1' },
    '磁暴':     { base:70, bonus:30, trigger:'1号或3号位', max:100, note:'传动1' },
  };
  if (positionSkills[n]) {
    const { base, bonus, trigger, max, note } = positionSkills[n];
    return tipWrap('📍',`${n}：位置加成`,
      tipInfo(`位于 <b style="color:#ffd970">${trigger}</b> 时威力 +${bonus}（${note}）`) +
      tipTable(['情况','威力'],[
        [['未处于触发位置（默认）', base], false],
        [[`处于${trigger}`, max], true],
      ]) +
      tipNote('请根据实际位置手动选择上方对应威力填入')
    );
  }

  // ── 5. 应对状态倍率技能 ───────────────────────────────────────
  const countertSkills = {
    '偷袭':   { base:85,  mult:3,   note:'应对状态触发' },
    '突袭':   { base:70,  mult:3,   note:'应对状态触发' },
    '无影脚': { base:85,  mult:2,   note:'应对状态触发' },
    '爆冲':   { base:65,  mult:5,   note:'应对状态触发' },
    '技巧打击':{ base:35, mult:10,  note:'应对状态触发' },
    '闪燃':   { base:40,  mult:4,   note:'应对状态触发' },
    '龙卷风': { base:70,  mult:1.5, note:'应对状态触发，迅捷' },
    '虫击':   { base:90,  mult:2,   note:'应对状态触发，且无视系别抵抗' },
  };
  if (countertSkills[n]) {
    const { base, mult, note } = countertSkills[n];
    const triggered = Math.round(base * mult);
    return tipWrap('🛡️',`${n}：应对状态倍率`,
      tipInfo(`${note}，威力变为 <b>×${mult}</b>`) +
      tipTable(['情况','威力'],[
        [['普通使用', base], false],
        [['应对状态触发', triggered], false],
      ]) +
      tipNote('请根据是否应对触发，手动选择对应威力填入')
    );
  }

  // ── 6. 怨力打击 ───────────────────────────────────────────────
  if (n === '怨力打击') {
    return tipWrap('💢','怨力打击：蓄力特殊机制',
      tipInfo('蓄力1回合，若蓄力期间被攻击，威力变为<b>敌方技能威力的3倍</b>') +
      tipTable(['情况','威力'],[
        [['正常释放（未被攻击）', 1], false],
        [['蓄力期被攻击', '敌方技能威力×3'], false],
      ]) +
      tipNote('若被打断，请手动计算并填入威力（敌方技能威力×3）')
    );
  }

  // ── 7. HP 损失相关 ────────────────────────────────────────────
  if (n === '垂死反击') {
    const rows = [100,80,60,40,20,0].map(hp => {
      const p = 80 + Math.floor((100-hp)/5)*5;
      return [[`当前HP ${hp}%`, p], hp === 100 || hp === 0];
    });
    return tipWrap('💀','垂死反击：HP越低威力越高',
      tipInfo('自己每失去5%生命，威力 <b>+5</b>（HP满=80，HP0%=180）') +
      tipTable(['HP百分比','威力'], rows) +
      tipNote('请根据当前HP百分比手动填入对应威力')
    );
  }
  if (n === '彗星') {
    const rows = [100,80,60,40,20,0].map(hp => {
      const p = Math.max(0, 240 - Math.floor((100-hp)/5)*10);
      return [[`当前HP ${hp}%`, p], hp === 100];
    });
    return tipWrap('☄️','彗星：HP越低威力越低，使用后自杀',
      tipInfo('每失去5%生命，威力 <b>-10</b>（HP满=240，HP0%≈0），<b style="color:#ff7070">使用后消耗全部生命</b>') +
      tipTable(['HP百分比','威力'], rows) +
      tipNote('请根据当前HP百分比手动填入对应威力')
    );
  }
  if (n === '筛管奔流') {
    return tipWrap('🌿','筛管奔流：高血量加成',
      tipInfo('自身HP <b>> 80%</b> 时，威力 <b>+75</b>') +
      tipTable(['情况','威力'],[
        [['HP ≤ 80%（默认）', 80], false],
        [['HP > 80%', 155], false],
      ]) +
      tipNote('请根据当前HP是否>80%选择对应威力')
    );
  }
  if (n === '彼岸之手') {
    return tipWrap('✋','彼岸之手：低HP降低能耗',
      tipInfo('自己每失去10%生命，<b>能耗 -1</b>（不影响威力，基础威力固定150）') +
      tipNote('威力固定为150，此技能的浮动在于能耗降低，不影响伤害计算')
    );
  }

  // ── 8. 敌方能量/叠层相关 ─────────────────────────────────────
  if (n === '坟场搏击') {
    const rows = [0,1,2,3,4,5,6,7,8,9,10].map(e => {
      const mult = Math.max(0, 1 - e*0.1);
      const p = Math.round(180 * mult);
      return [[`敌方 ${e} 能量`, `×${mult.toFixed(1)} = ${p}`], e === 0];
    });
    return tipWrap('⚰️','坟场搏击：敌方能量越高威力越低',
      tipInfo('敌方每有1能量，本次技能威力 <b>-10%</b>（基础威力180）') +
      tipTable(['敌方能量','实际威力'], rows) +
      tipNote('请根据敌方当前能量手动填入威力（不含本系加成）')
    );
  }
  if (n === '碎冰冰') {
    const rows = [0,1,2,3,4,5].map(e => [[`${e}层冻结`, 40+e*20], e===0]);
    return tipWrap('🧊','碎冰冰：敌方冻结层数加成',
      tipInfo('敌方每有1层冻结，威力 <b>+20</b>（基础40）') +
      tipTable(['敌方冻结层数','威力'], rows) +
      tipNote('请根据敌方冻结层数手动填入威力')
    );
  }
  if (n === '极寒领域') {
    return tipWrap('❄️','极寒领域：敌方冻结触发加成',
      tipInfo('若敌方有冻结，威力 <b>+60</b>；应对状态时冻结层数翻倍') +
      tipTable(['情况','威力'],[
        [['敌方无冻结', 105], false],
        [['敌方有冻结', 165], false],
      ]) +
      tipNote('请根据敌方是否有冻结手动选择威力')
    );
  }
  if (n === '牵连') {
    const rows = [0,1,2,3].map(e => [[`${e}只力竭精灵`, 85+e*30], e===0]);
    return tipWrap('🔗','牵连：敌方力竭精灵数加成',
      tipInfo('敌方每有1只力竭精灵，威力 <b>+30</b>（基础85）') +
      tipTable(['敌方力竭精灵数','威力'], rows) +
      tipNote('请根据敌方力竭精灵数手动填入威力')
    );
  }
  if (n === '鸩毒') {
    const rows = [0,1,2,3,4,5].map(e => [[`${e}层中毒（普通）`, 75+e*10], e===0]);
    return tipWrap('🐦','鸩毒：敌方中毒层数加成',
      tipInfo('敌方每有1层中毒，威力 <b>+10</b>（基础75）；应对状态时每层改为 <b>+20</b>') +
      tipTable(['敌方中毒层数','普通威力'], rows) +
      tipNote('应对状态时：威力 = 75 + 中毒层×20')
    );
  }
  if (n === '燃尽') {
    const rows = [100,80,60,40,20,0].map(hp => {
      const p = 155 - Math.floor((100-hp)/5)*5;
      return [[`敌方HP ${hp}%`, Math.max(0,p)], hp===100];
    });
    return tipWrap('🔥','燃尽：敌方HP越低威力越低',
      tipInfo('敌方每失去5%生命，威力 <b>-5</b>（敌方满HP=155）') +
      tipTable(['敌方HP百分比','威力'], rows) +
      tipNote('请根据敌方当前HP百分比手动填入威力')
    );
  }
  if (n === '毒液渗透') {
    return tipWrap('☠️','毒液渗透：中毒层数降低能耗',
      tipInfo('敌方每有1层中毒效果，<b>能耗 -1</b>，并使敌方获得1层中毒；基础威力固定120') +
      tipNote('威力固定120，浮动为能耗降低，不影响伤害计算')
    );
  }
  if (n === '四维降解') {
    return tipWrap('🌀','四维降解：敌方印记降低能耗',
      tipInfo('敌方每有1层印记，<b>能耗 -1</b>（不影响威力，基础威力固定100）') +
      tipNote('威力固定100，浮动为能耗降低，不影响伤害')
    );
  }
  if (n === '多维击打') {
    const rows = [0,1,2,3,4,5].map(e => [[`${e}层星陨印记`, `1+${e} = ${1+e}连击`], e===0]);
    return tipWrap('💫','多维击打：敌方星陨印记增加连击',
      tipInfo('基础1连击，敌方每有1层星陨印记，<b>连击数+1</b>（单击威力15）') +
      tipTable(['敌方星陨印记层数','总连击数'], rows) +
      tipNote('请根据星陨印记层数手动设置连击次数')
    );
  }

  // ── 9. 自身状态加成 ───────────────────────────────────────────
  if (n === '超级糖果') {
    return tipWrap('🍬','超级糖果：萌化触发加成',
      tipInfo('自己获得萌化时，本次威力 <b>+60</b>') +
      tipTable(['情况','威力'],[
        [['无萌化', 100], false], [['有萌化', 160], false],
      ]) +
      tipNote('请根据是否有萌化选择威力')
    );
  }
  if (n === '幼态延续') {
    return tipWrap('🐣','幼态延续：萌化触发加成',
      tipInfo('自身拥有萌化时，威力 <b>+60</b>') +
      tipTable(['情况','威力'],[
        [['无萌化', 90], false], [['有萌化', 150], false],
      ])
    );
  }
  if (n === '破罐破摔') {
    return tipWrap('🏺','破罐破摔：自身有减益加成',
      tipInfo('自己有减益时，威力 <b>+60</b>') +
      tipTable(['情况','威力'],[
        [['无减益', 80], false], [['有减益', 140], false],
      ])
    );
  }

  // ── 10. 能耗相关浮动 ──────────────────────────────────────────
  if (n === '逆袭') {
    const rows = [3,4,5,6,7,8,9,10].map(c => [[`能耗 ${c}`, 100+(c-3)*50], c===3]);
    return tipWrap('🔄','逆袭：能耗决定威力',
      tipInfo('基础能耗3，威力100；能耗每 <b>+1</b>，威力 <b>+50</b>') +
      tipTable(['技能能耗','威力'], rows) +
      tipNote('受能耗增益（如技能石）影响，请根据实际能耗填入威力')
    );
  }
  if (n === '涌泉') {
    const rows = [6,5,4,3,2,1].map(c => [[`能耗 ${c}`, 60+(6-c)*10], c===6]);
    return tipWrap('💧','涌泉：能耗越低威力越高',
      tipInfo('基础能耗6，威力60；能耗每 <b>-1</b>，威力 <b>+10</b>') +
      tipTable(['技能能耗','威力'], rows) +
      tipNote('受能耗降低效果影响，请根据实际能耗填入威力')
    );
  }
  if (n === '触底强击') {
    return tipWrap('⚡','触底强击：能量耗尽加成',
      tipInfo('使用后若能量耗尽（变为0），威力 <b>+110</b>') +
      tipTable(['情况','威力'],[
        [['使用后有剩余能量', 65], false], [['使用后能量归零', 175], false],
      ]) +
      tipNote('请根据使用后能量是否耗尽选择威力')
    );
  }

  // ── 11. 上回合/条件触发 ───────────────────────────────────────
  if (n === '气势一击') {
    return tipWrap('💥','气势一击：上回合应对成功加成',
      tipInfo('若上回合应对成功，本次威力 <b>+180</b>') +
      tipTable(['情况','威力'],[
        [['上回合未应对', 80], false], [['上回合应对成功', 260], false],
      ])
    );
  }
  if (n === '见招拆招') {
    return tipWrap('🥋','见招拆招：上回合状态技能加成',
      tipInfo('若上回合使用了状态技能，本次威力 <b>+55</b>') +
      tipTable(['情况','威力'],[
        [['上回合非状态技能', 65], false], [['上回合用了状态技能', 120], false],
      ])
    );
  }
  if (n === '当头棒喝') {
    return tipWrap('🔨','当头棒喝：敌方换精灵加成',
      tipInfo('若敌方本回合更换了精灵，本次威力 <b>+100</b>') +
      tipTable(['情况','威力'],[
        [['敌方未换精灵', 80], false], [['敌方本回合换精灵', 180], false],
      ])
    );
  }
  if (n === '草虫冲击') {
    return tipWrap('🌿','草虫冲击：敌方换精灵加成',
      tipInfo('若敌方本回合更换了精灵，威力 <b>+50</b> 且无视系别抵抗') +
      tipTable(['情况','威力'],[
        [['敌方未换精灵', 80], false], [['敌方本回合换精灵', 130], false],
      ])
    );
  }
  if (n === '天旋地转') {
    return tipWrap('🌪️','天旋地转：迸发加成',
      tipInfo('迸发触发时，威力 <b>+30</b>；先手+1') +
      tipTable(['情况','威力'],[
        [['普通使用', 60], false], [['迸发触发', 90], false],
      ])
    );
  }
  if (n === '扇风') {
    return tipWrap('🌬️','扇风：先于敌方攻击加成',
      tipInfo('若先于敌方攻击，威力 <b>+50%</b>（×1.5）') +
      tipTable(['情况','威力'],[
        [['后攻或同速', 75], false], [['先于敌方行动', 112], false],
      ])
    );
  }

  // ── 12. 迸发系列 ─────────────────────────────────────────────
  if (n === '电弧') {
    return tipWrap('⚡','电弧：迸发加成',
      tipInfo('迸发触发时，威力 <b>+40</b>') +
      tipTable(['情况','威力'],[
        [['普通使用', 80], false], [['迸发触发', 120], false],
      ])
    );
  }
  if (n === '引雷') {
    return tipWrap('⚡','引雷：迸发加成',
      tipInfo('迸发触发时，本次威力 <b>+20</b>（2连击）') +
      tipTable(['情况','单击威力（×2）'],[
        [['普通使用', 35], false], [['迸发触发', 55], false],
      ])
    );
  }
  if (n === '雷暴') {
    return tipWrap('⛈️','雷暴：累积迸发加成',
      tipInfo('获得本场生效过的所有迸发，每获得1种，<b>能耗+1、威力+10</b>（基础威力55）') +
      tipNote('威力视已累积迸发种类数而定，请手动填入。例如累积5种迸发：威力=105，能耗=6')
    );
  }

  // ── 13. 永久成长型 ───────────────────────────────────────────
  if (n === '乘胜追击') {
    return tipWrap('🏃','乘胜追击：连击数随使用次数增长',
      tipInfo('初始1连击，每次使用后 <b>连击数永久+1</b>（本次威力40/击）') +
      tipNote('请根据本场使用次数在「连击次数」里填入当前连击数')
    );
  }
  if (n === '趁火打劫') {
    return tipWrap('🔥','趁火打劫：击败敌方连击永久增长',
      tipInfo('2连击；若本次使用击败敌方，<b>连击数永久+2</b>（单击威力35）') +
      tipNote('请在「连击次数」里填入当前连击数（初始2，每次击杀+2）')
    );
  }
  if (n === '孢子爆散') {
    return tipWrap('🍄','孢子爆散：每次使用连击永久+2',
      tipInfo('初始1连击，每次使用后 <b>连击数永久+2</b>（单击威力30）') +
      tipNote('请在「连击次数」里填入当前连击数（初始1，每次+2）')
    );
  }
  if (n === '叠势') {
    return tipWrap('🥊','叠势：每次应对成功连击永久+2',
      tipInfo('初始2连击，每成功应对1次 <b>连击数永久+2</b>（单击威力25）') +
      tipNote('请在「连击次数」里填入当前连击数（初始2，每次应对+2）')
    );
  }
  if (n === '月光合奏') {
    return tipWrap('🌙','月光合奏：双方萌化层数决定连击',
      tipInfo('初始1连击，双方携带的所有精灵每有1层萌化，<b>连击数+1</b>（单击威力30）') +
      tipNote('请根据双方萌化总层数在「连击次数」里填入对应连击数')
    );
  }
  if (n === '飞断') {
    return tipWrap('🪲','飞断：奉献加成',
      tipInfo('己方队伍获得1次奉献效果时，威力 <b>+20</b>（基础威力20）') +
      tipTable(['情况','威力'],[
        [['无奉献', 20], false], [['有奉献', 40], false],
      ])
    );
  }
  if (n === '虫群') {
    return tipWrap('🐛','虫群：受奉献影响',
      tipInfo('本技能会受「奉献」效果影响（具体加成视奉献层数），基础1连击') +
      tipNote('奉献增加的连击数请手动填入「连击次数」')
    );
  }

  return null;
}

// FULL 模式：解析某个技能槽的「变动威力」（闪击/鸣沙陷阱/冰锋横扫/魔能爆等）
//   返回目标威力值；规则表未覆盖该技能时返回 null（保持用户填写的威力不变）
function resolveAutoPowerForSlot(side, idx, skillObj) {
  const atkS = side === 'atk' ? state.atk : state.def;
  const defS = side === 'atk' ? state.def : state.atk;
  if (!atkS || !defS) return null;

  // 只有「基础威力为占位值」的技能才自动覆盖，避免抹掉用户手动修改
  const AUTO_POWERS = { '闪击': 60, '鸣沙陷阱': 60, '冰锋横扫': 1, '魔能爆': 1, '怨力打击': 1, '钢钻': 1 };
  const base = AUTO_POWERS[skillObj.n];
  if (base === undefined) return null;

  const ctx = buildFullPowerCtx(side, idx, skillObj);
  const r = resolveSkillPower(skillObj, ctx);
  if (!r.hasRule) return null;
  const target = (skillObj.p || 0) + r.powerAdd;
  if (!(target > 0)) return null;
  return target;
}

// FULL 模式：组装技能槽的威力规则 ctx（含 util 注入与两侧技能槽数据）
function buildFullPowerCtx(side, idx, skillObj) {
  const atkS = side === 'atk' ? state.atk : state.def;
  const defS = side === 'atk' ? state.def : state.atk;
  const selfSpirit = side === 'atk' ? state.atk : state.def;
  const foeSide = side === 'atk' ? 'def' : 'atk';
  return {
    skAttr: skillObj ? (skillObj.a || '') : '',
    skCost: skillObj ? (skillObj.c || 0) : 0,
    skKind: skillObj ? (skillObj.k || '') : '',
    atk: atkS, def: defS,
    atkA1: atkS ? (atkS.a1 || '') : '',
    atkA2: atkS ? (atkS.a2 || '') : '',
    defA1: defS ? (defS.a1 || '') : '',
    defA2: defS ? (defS.a2 || '') : '',
    opts: readPowerOptsByMode('full', `${side}${idx}`),
    util: buildPowerUtil({
      spdAtk: atkS ? (atkS.real_spd || atkS.sp || 0) : 0,
      spdDef: defS ? (defS.real_spd || defS.sp || 0) : 0,
      pdefAtk: atkS ? (atkS.real_pdef || atkS.pd || 0) : 0,
      pdefDef: defS ? (defS.real_pdef || defS.pd || 0) : 0,
      foeCost: () => fullState[foeSide].reduce((s, sl) => s + (sl && sl.skill ? (sl.skill.c || 0) : 0), 0),
      sidePower: (c, which) => {
        // 「两侧技能威力」：取本槽左右相邻槽的威力
        const s = fullState[side];
        const nb = which === 'left' ? s[idx - 1] : s[idx + 1];
        if (!nb || !nb.skill) return 0;
        const v = nb.power !== undefined ? nb.power : (nb.skill.p || 0);
        return v || 0;
      },
    }),
  };
}
