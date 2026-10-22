// js/05-card.js — 卡片与选择交互层：renderCard / setupSearch / 能力等级 / IV / 交换 / num-combo
// 加载顺序位次 5。依赖 js/01（state / matchQuery）/ js/03（特性面板显隐）/ js/04（updatePowerTip）。
// 本文件只有声明 + 数据常量；DOM 绑定与 init 统一在 js/08-fav-init.js。
const SORTED_SPIRITS = SPIRITS;

// 精灵名称 → BWiki 图鉴页（标题即精灵名，需按 URL 规则编码）
function spiritWikiUrl(name) {
  return 'https://wiki.biligame.com/nrc/' + encodeURIComponent(name);
}

function recalcStats(side) {
  const spirit = side === 'atk' ? state.atk : state.def;
  if (!spirit) return;

  const nat = getNature(side);

  let ivPatk, ivMatk, ivSpd, ivHp, ivDef, ivMdef;
  if (side === 'atk') {
    ivPatk = readIV('atk-iv-patk');
    ivMatk = readIV('atk-iv-matk');
    ivSpd  = readIV('atk-iv-spd');
    ivHp   = readIV('atk-iv-hp');
    ivDef  = readIV('atk-iv-pdef');
    ivMdef = readIV('atk-iv-mdef');
  } else {
    ivPatk = readIV('def-iv-patk');
    ivMatk = readIV('def-iv-matk');
    ivSpd  = readIV('def-iv-spd');
    ivHp   = readIV('def-iv-hp');
    ivDef  = readIV('def-iv-def');
    ivMdef = readIV('def-iv-mdef');
  }

  spirit.real_hp   = calcRealStat(spirit.hp, ivHp,   nat.hp,   true);
  spirit.real_patk = calcRealStat(spirit.pa, ivPatk,  nat.patk, false);
  spirit.real_matk = calcRealStat(spirit.ma, ivMatk,  nat.matk, false);
  spirit.real_pdef = calcRealStat(spirit.pd, ivDef,   nat.pdef, false);
  spirit.real_mdef = calcRealStat(spirit.md, ivMdef,  nat.mdef, false);
  spirit.real_spd  = calcRealStat(spirit.sp, ivSpd,   nat.spd,  false);

  const map   = {hp: spirit.real_hp, patk: spirit.real_patk, matk: spirit.real_matk,
                 pdef: spirit.real_pdef, mdef: spirit.real_mdef, spd: spirit.real_spd};
  const bases = {hp: spirit.hp, patk: spirit.pa, matk: spirit.ma,
                 pdef: spirit.pd, mdef: spirit.md, spd: spirit.sp};
  for (const [k, v] of Object.entries(map)) {
    const el  = document.getElementById('val-'  + side + '-' + k);
    if (el)  el.textContent = v;
    const bel = document.getElementById('base-' + side + '-' + k);
    if (bel) bel.textContent = '种:' + bases[k];
  }
  spirit.patk = spirit.real_patk;
  spirit.matk = spirit.real_matk;
  spirit.pdef = spirit.real_pdef;
  spirit.mdef = spirit.real_mdef;
  // 速度变化时同步刷新浮动威力提示
  if (typeof updatePowerTip === 'function') updatePowerTip();
}
// ── 已搬迁至 js/01-core.js（搜索匹配/愿力冲击/state/面板值/IV/性格/克制/查表）──

// ============================================================
// MODE SWITCH
// ============================================================

// ============================================================
// LEVEL CONTROLS
// ============================================================
// SWAP ATTACKER / DEFENDER
// ============================================================
function swapSpirits() {
  // 交换精灵数据
  const tmp = state.atk;
  state.atk = state.def;
  state.def = tmp;

  // 交换搜索框显示文字（走 setPickerValue，保持「名称=占位显示」状态）
  setPickerValue(document.getElementById('atk-search'), state.atk ? state.atk.n : '');
  setPickerValue(document.getElementById('def-search'), state.def ? state.def.n : '');

  // 交换性格选项（现在只有一个性格下拉）
  function swapSelect(idA, idB) {
    const a = document.getElementById(idA);
    const b = document.getElementById(idB);
    if (!a || !b) return;
    const tv = a.value; a.value = b.value; b.value = tv;
  }
  swapSelect('atk-nature', 'def-nature');

  // 交换两侧个体值（IV 跟随精灵；防方物防 id 是 def-iv-def，其余规律统一）
  [['atk-iv-patk', 'def-iv-patk'],
   ['atk-iv-matk', 'def-iv-matk'],
   ['atk-iv-spd',  'def-iv-spd'],
   ['atk-iv-hp',   'def-iv-hp'],
   ['atk-iv-pdef', 'def-iv-def'],
   ['atk-iv-mdef', 'def-iv-mdef']
  ].forEach(([aId, dId]) => {
    const av = readIV(aId), dv = readIV(dId);
    setIv(aId, dv);
    setIv(dId, av);
  });

  // 重新渲染两侧卡片与属性
  renderCard('atk', state.atk);
  renderCard('def', state.def);

  // 恢复能力等级互换
  // 互换四个能力等级
  const tmpAtkAtk = state.atkAtkLevel; const tmpAtkDef = state.atkDefLevel;
  state.atkAtkLevel = state.defAtkLevel; state.atkDefLevel = state.defDefLevel;
  state.defAtkLevel = tmpAtkAtk;        state.defDefLevel = tmpAtkDef;
  // 更新显示（refreshLevelUI 为全局函数，定义在 changeLevel 之后）
  refreshLevelUI('atk'); refreshLevelUI('def');

  syncModeBAutoFields();
  calc();
}

// ============================================================
// changeLevel(side, kind, delta)
//   side: 'atk' | 'def'  — 哪方精灵
//   kind: 'atk' | 'def'  — 攻击能力等级 or 防御能力等级
function changeLevel(side, kind, delta) {
  const key = side + (kind === 'atk' ? 'Atk' : 'Def') + 'Level'; // e.g. 'atkAtkLevel'
  // 能力等级范围限制在 -99 ~ 99（与输入框一致）
  state[key] = Math.max(-99, Math.min(99, (state[key] || 0) + delta));
  const val = state[key];
  const valEl = document.getElementById(`${side}-${kind}level-val`);
  const multEl = document.getElementById(`${side}-${kind}level-mult`);
  setLevelValEl(valEl, val);
  if (multEl) multEl.textContent = '×' + levelMult(val).toFixed(2);
  calc();
  if (state.mode === 'FULL') calcFull();
}

// 能力等级显示元素兼容 helper（现为 number input，保留 span 兼容）
function setLevelValEl(el, val) {
  if (!el) return;
  if (el.tagName === 'INPUT') el.value = val;
  else el.textContent = val >= 0 ? '+' + val : '' + val;
}

// 全局刷新某侧两个能力等级的输入框与倍率显示
function refreshLevelUI(side) {
  ['atk','def'].forEach(kind => {
    const key = side + (kind==='atk'?'Atk':'Def') + 'Level';
    const val = state[key] || 0;
    setLevelValEl(document.getElementById(`${side}-${kind}level-val`), val);
    const multEl = document.getElementById(`${side}-${kind}level-mult`);
    if (multEl) multEl.textContent = '×' + levelMult(val).toFixed(2);
  });
}

// 直接输入能力等级（整数，非法输入回退 0），后续同步与 changeLevel 对齐
function onLevelInput(side, kind, el) {
  const v = parseInt(el.value, 10);
  const key = side + (kind === 'atk' ? 'Atk' : 'Def') + 'Level';
  // 能力等级范围限制在 -99 ~ 99
  state[key] = Number.isNaN(v) ? 0 : Math.max(-99, Math.min(99, v));
  el.value = state[key];
  const val = state[key];
  const multEl = document.getElementById(`${side}-${kind}level-mult`);
  if (multEl) multEl.textContent = '×' + levelMult(val).toFixed(2);
  calc();
  if (state.mode === 'FULL') calcFull();
}

// ============================================================
// SKILL TYPE
// ============================================================
function setSkillType(type) {
  state.skillType = type;
  ['btn-physical','btn-physical-b'].forEach(id => { const e=document.getElementById(id); if(e) e.className='atk-toggle-btn'+(type==='physical'?' active':''); });
  ['btn-magical','btn-magical-b'].forEach(id => { const e=document.getElementById(id); if(e) e.className='atk-toggle-btn'+(type==='magical'?' active':''); });
  if (state.atk) setAtkStat(type==='physical'?'patk':'matk', false);
  if (state.def) setDefStat(type==='physical'?'pdef':'mdef', false);
  calc();
}
function setAtkStat(s, doCalc=true) {
  state.atkStat = s;
  document.getElementById('atk-stat-patk').className = 'stat-box'+(s==='patk'?' active-atk':'');
  document.getElementById('atk-stat-matk').className = 'stat-box'+(s==='matk'?' active-atk':'');
  if (doCalc) calc();
}
function setDefStat(s, doCalc=true) {
  state.defStat = s;
  document.getElementById('def-stat-pdef').className = 'stat-box'+(s==='pdef'?' active-def':'');
  document.getElementById('def-stat-mdef').className = 'stat-box'+(s==='mdef'?' active-def':'');
  if (doCalc) calc();
}

function updatePanelFavBtn(side, enabled) {
  const btn = document.getElementById(side + '-fav-btn');
  if (!btn) return;
  btn.disabled = !enabled;
  btn.title = enabled ? '收藏当前精灵配置' : '选择精灵后可收藏';
}

function renderCard(side, spirit) {
  const card    = document.getElementById(side + '-card');
  const statsEl = document.getElementById(side + '-stats');
  const lvRow   = document.getElementById(side === 'atk' ? 'atk-level-row' : 'def-level-row');
  const natRow  = document.getElementById(side + '-nature-row');
  const redRow  = document.getElementById(side + '-reduce-row');

  if (!spirit) {
    card.innerHTML = `<div class="no-spirit">请搜索并选择${side==='atk'?'攻击方':'防御方'}精灵</div>`;
    [statsEl, lvRow, natRow, redRow].forEach(el => el && (el.style.display='none'));
    updatePanelFavBtn(side, false);
    return;
  }
  // st 中名字已包含的形态词不再重复显示（如「鸭吉吉（蓬松的样子）」st=蓬松的样子）
  const stText = spirit.st
    ? spirit.st.split('/').filter(p => p && !spirit.n.includes(p)).join('/')
    : '';
  card.innerHTML = `
    <div class="spirit-avatar">${spirit.img ? `<img src="${spirit.img}" alt="${spirit.n}" onerror="this.parentNode.innerHTML='<span class=\'avatar-fallback\'>${getEmoji(spirit.a1)}</span>'">` : `<span class="avatar-fallback">${getEmoji(spirit.a1)}</span>`}</div>
    <div class="spirit-info">
      <div class="spirit-title-row">
        <span class="spirit-types">${typeChip(spirit.a1)}${spirit.a2?typeChip(spirit.a2):''}</span>
        <a class="spirit-name" href="${spiritWikiUrl(spirit.n)}" target="_blank" rel="noopener noreferrer" title="在 BWiki 查看「${spirit.n}」图鉴">${spirit.n}</a>
        ${stText ? `<span class="spirit-meta">${stText}</span>` : ''}
      </div>
      ${spirit.tr ? `<div class="spirit-trait">特性：${spirit.tr}</div>` : ''}
      ${spirit.tr_desc ? `<div class="spirit-trait-desc">${spirit.tr_desc}</div>` : ''}
    </div>
  `;
  statsEl.style.display = 'grid';
  if (lvRow) lvRow.style.display = 'flex';
  if (natRow) natRow.style.display = 'flex';
  if (redRow && side === 'def') redRow.style.display = 'flex';
  updatePanelFavBtn(side, true);
  recalcStats(side);
}

// ============================================================
// 选择框的「占位符」语义（精灵搜索框 / 技能下拉框共用）
// ============================================================
// 选中后框内仍显示名称，但它只是占位显示（灰字，class is-placeholder）：
//   · 点击（聚焦）时按「未选择」处理 —— 下拉展示全量分组列表，不按该名称过滤
//   · 一旦输入即视为真实过滤词（灰字消失、名称被替换），失焦未选中时恢复名称
// dataset.picked 记录「框内文字来自哪次选择」，用于区分「占位显示」与「用户输入」。
function setPickerValue(el, name) {
  if (!el) return;
  if (name) {
    el.value = name;
    el.dataset.picked = name;
    el.classList.add('is-placeholder');
  } else {
    el.value = '';
    delete el.dataset.picked;
    el.classList.remove('is-placeholder');
  }
}

// 是否正显示「已选中项」（未被用户输入覆盖）
function isPickedDisplay(el) {
  return !!(el && el.dataset.picked !== undefined && el.value.trim() === el.dataset.picked);
}

// 用户开始输入 → 结束占位显示（保留框内文字作为过滤词）
function clearPickerPlaceholder(el) {
  if (!el) return;
  delete el.dataset.picked;
  el.classList.remove('is-placeholder');
}

// 失焦还原：点击外部 / Tab 离开且未做修改 → 把已选项显示回去（变回原样）
//   containerId 为该组件容器 id，焦点只是移到组件内部（如点下拉空白处）时不还原
function bindPickerBlurRestore(el, containerId, getChosen) {
  if (!el) return;
  el.addEventListener('blur', () => {
    setTimeout(() => {
      const wrap = document.getElementById(containerId);
      const ae = document.activeElement;
      if (wrap && ae && wrap.contains(ae)) return;
      const name = getChosen();
      if (name) setPickerValue(el, name);
      else clearPickerPlaceholder(el);
    }, 0);
  });
}

// 仍显示「已选项」时直接打字 → 先清空，避免把已选名称拼进过滤词（光标落在名称中间的场景）
function bindPickerTypeReset(el) {
  if (!el || el.dataset.typeResetBound) return;
  el.dataset.typeResetBound = '1';
  el.addEventListener('keydown', e => {
    if (!isPickedDisplay(el)) return;
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    clearPickerPlaceholder(el);
    el.value = '';

  });
}

// ============================================================
// 数值下拉（可自由输入）：其他额外倍率 / 星陨印记层数 / 防御方减伤
//   · 点击输入框展开预设选项（data-num-opts 声明），点选项写回并触发原有
//     oninput（calc / calcFull），各模式重算入口不变
//   · 也可直接键入任意数值；失焦时为空或非数字则恢复默认值
//   · 下拉下方空间不足时自动向上展开；A/B/FULL 三模式共用同一套实现
// ============================================================
function numComboRefs(input) {
  const wrap = input && input.closest ? input.closest('.num-combo') : null;
  if (!wrap) return null;
  return { wrap, drop: wrap.querySelector('.num-combo-dropdown') };
}

function closeAllNumCombos(except) {
  document.querySelectorAll('.num-combo-dropdown.open').forEach(d => {
    if (d !== except) d.classList.remove('open');
  });
}

function openNumCombo(input) {
  if (!input || input.disabled) return;
  const refs = numComboRefs(input);
  if (!refs || !refs.drop) return;
  closeAllNumCombos(refs.drop);
  // 高亮与当前输入值一致的选项（自由输入的值不在预设中时无高亮）
  const cur = input.value.trim();
  refs.drop.querySelectorAll('.num-combo-option').forEach(o => {
    o.classList.toggle('selected', o.getAttribute('data-val') === cur);
  });
  refs.drop.classList.add('open');
  // 智能翻转：下方空间不足以完整展示时向上展开
  refs.drop.style.top = 'calc(100% + 3px)';
  refs.drop.style.bottom = 'auto';
  const r = refs.wrap.getBoundingClientRect();
  const spaceBelow = window.innerHeight - r.bottom;
  if (spaceBelow < refs.drop.offsetHeight + 8 && r.top > spaceBelow) {
    refs.drop.style.top = 'auto';
    refs.drop.style.bottom = 'calc(100% + 3px)';
  }
}

function closeNumCombo(input) {
  const refs = numComboRefs(input);
  if (refs && refs.drop) refs.drop.classList.remove('open');
}

function pickNumComboOption(input, val) {
  input.value = val;
  closeNumCombo(input);
  input.dispatchEvent(new Event('input'));   // 复用输入框原有的 oninput 重算
  input.blur();
}

function initNumCombos() {
  document.querySelectorAll('.num-combo').forEach(wrap => {
    const input = wrap.querySelector('input');
    const drop  = wrap.querySelector('.num-combo-dropdown');
    if (!input || !drop || drop.dataset.built) return;
    drop.dataset.built = '1';
    const opts = (input.getAttribute('data-num-opts') || '').split(',').map(s => s.trim()).filter(Boolean);
    drop.innerHTML = opts.map(v => '<div class="num-combo-option" data-val="' + v + '">' + v + '</div>').join('');
    drop.querySelectorAll('.num-combo-option').forEach(opt => {
      opt.addEventListener('mousedown', e => {
        e.preventDefault();   // 保持焦点，避免 blur 抢先收起下拉
        pickNumComboOption(input, opt.getAttribute('data-val'));
      });
    });
    // 用 mousedown 而非仅 focus：已聚焦时再次点击也能重新展开
    input.addEventListener('mousedown', () => openNumCombo(input));
    input.addEventListener('focus', () => openNumCombo(input));
    input.addEventListener('blur', () => {
      closeNumCombo(input);
      const v = input.value.trim();
      if (v === '' || isNaN(parseFloat(v))) input.value = input.defaultValue;   // 空 / 非数字 → 恢复默认
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeNumCombo(input); input.blur(); }
    });
  });
}


// ── 全局版：应用精灵到指定侧（供 loadFavConfig 等外部调用）──
function applySpirit_global(side, spirit) {
  if (side === 'atk') state.atk = Object.assign({}, spirit);
  else                state.def = Object.assign({}, spirit);
  const input = document.getElementById(side + '-search');
  const dd    = document.getElementById(side + '-dropdown');
  const arrow = document.getElementById(side + '-search-arrow');
  setPickerValue(input, spirit.n);   // 名称仅作占位显示（灰字），点击后按未选择处理
  // 选完即失焦：否则光标留在框内，再次点击不会触发 focus → 下拉无法重新展开
  if (input) input.blur();
  if (dd) dd.classList.remove('open');
  if (arrow) arrow.textContent = '▼';

  // 更换精灵后重置该侧能力等级（攻/防各两级）
  state[side + 'AtkLevel'] = 0;
  state[side + 'DefLevel'] = 0;
  refreshLevelUI(side);
  // 更换精灵后重置该侧特性面板（清手动覆盖 + 条件回默认 + 作废签名缓存），避免沿用旧精灵的特性值
  resetTraitPanelForSide(side);

  // 选中精灵后自动套用 PVP 推荐（性格 + 个体值）
  const pvp = (typeof SPIRITS_PVP !== 'undefined' && SPIRITS_PVP[spirit.n]) ? SPIRITS_PVP[spirit.n] : null;

  // 性格：取第一个推荐；无记录则保持普通
  const natSel = document.getElementById(side + '-nature');
  if (natSel) {
    const recNat = (pvp && pvp.n && pvp.n[0]) || null;
    natSel.value = (recNat && NATURE_TABLE[recNat]) ? recNat : 'neutral';
  }

  // 个体值：推荐 v 中的属性设为 60，其余设为 0
  if (pvp && Array.isArray(pvp.v)) {
    // 数据缩写 pa/ma/pd/md/sp/hp → 个体值按钮 id 后缀 patk/matk/pdef/mdef/spd/hp
    const IV_MAP = { hp:'hp', pa:'patk', ma:'matk', pd:'pdef', md:'mdef', sp:'spd' };
    const recIv = pvp.v.map(x => IV_MAP[x]).filter(Boolean);
    ['hp','patk','matk','pdef','mdef','spd'].forEach(k => {
      setIv(side + '-iv-' + k, recIv.includes(k) ? 60 : 0);
    });
  }

  renderCard(side, side === 'atk' ? state.atk : state.def);
  if (side === 'atk') setAtkStat(state.skillType === 'physical' ? 'patk' : 'matk', false);
  if (side === 'def') setDefStat(state.skillType === 'physical' ? 'pdef' : 'mdef', false);
  syncModeBAutoFields();
  calc();
}

function setupSearch(side) {
  const input = document.getElementById(side + '-search');
  const dd    = document.getElementById(side + '-dropdown');
  const arrow = document.getElementById(side + '-search-arrow');

  // ── 渲染下拉内容 ──────────────────────────────────────────
  function renderDropdown(q) {
    if (q) {
      // 有输入：过滤模式，扁平列表，最多 40 条（走拼音索引，见 js/01-core.js）
      const res = filterSpiritsByQuery(q).slice(0, 40);
      if (!res.length) {
        dd.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--text2)">无匹配精灵</div>';
        return;
      }
      dd.innerHTML = res.map(s => makeSpiritItem(s)).join('');
    } else {
      // 无输入：全量按属性分组展示，组内保持 SORTED_SPIRITS 的进化链顺序
      const groups = {};
      const attrOrder = ['普通','草','火','水','光','地','冰','龙','电','毒','虫','武','翼','萌','幽','恶','机械','幻'];
      attrOrder.forEach(a => { groups[a] = []; });
      SORTED_SPIRITS.forEach(s => {
        const k1 = s.a1 || '其他';
        if (!groups[k1]) groups[k1] = [];
        groups[k1].push(s);
        // 双属性精灵同时归入副属性分组（a1 === a2 时不重复）
        if (s.a2 && s.a2 !== s.a1) {
          if (!groups[s.a2]) groups[s.a2] = [];
          groups[s.a2].push(s);
        }
      });
      let html = '';
      const sortedKeys = Object.keys(groups).filter(k => groups[k].length > 0);
      sortedKeys.forEach(attr => {
        const icon = (typeof TYPE_ICONS !== 'undefined' && TYPE_ICONS[attr])
          ? '<img src="' + TYPE_ICONS[attr] + '" alt="" class="type-tag-icon" loading="lazy" onerror="this.remove()">'
          : '';
        html += '<div class="dropdown-group-header" data-attr="' + attr + '" style="padding:4px 12px 2px;display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none">' +
          icon +
          '<span style="font-size:11px;color:var(--text2)">' + groups[attr].length + ' 只</span>' +
          '<span class="type-tag" style="background:' + (TYPE_COLORS[attr] || '#888') + ';color:' + (TYPE_TEXT_DARK.has(attr) ? '#333' : '#fff') + ';font-size:11px;margin-left:auto">' + attr + '</span>' +
          '<span style="font-size:10px;color:var(--text2)" class="group-arrow">▶</span>' +
        '</div>' +
        '<div class="dropdown-group-body" data-attr="' + attr + '" style="display:none">' +
          groups[attr].map(s => makeSpiritItem(s)).join('') +
        '</div>';
      });
      dd.innerHTML = html;

      // 分组折叠/展开
      dd.querySelectorAll('.dropdown-group-header').forEach(hdr => {
        hdr.addEventListener('click', () => {
          const attr = hdr.dataset.attr;
          const body = dd.querySelector('.dropdown-group-body[data-attr="' + attr + '"]');
          if (!body) return;
          const arrowEl = hdr.querySelector('.group-arrow');
          const isOpen = body.style.display !== 'none';
          body.style.display = isOpen ? 'none' : 'block';
          if (arrowEl) arrowEl.textContent = isOpen ? '▶' : '▼';
        });
      });
    }

    // 统一绑定点击选择
    dd.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        const spirit = SPIRITS.find(s => s.n === item.dataset.name);
        if (!spirit) return;
        applySpirit(side, spirit);
      });
    });
  }

  // ── 构建单条精灵 item HTML ─────────────────────────────────
  function makeSpiritItem(s) {
    const thumb = s.img
      ? `<img src="${s.img}" alt="${s.n}" loading="lazy" style="width:28px;height:28px;object-fit:contain;border-radius:5px;vertical-align:middle" onerror="this.replaceWith(document.createTextNode('${getEmoji(s.a1)}'))">`
      : getEmoji(s.a1);
    const tag1 = typeTagHtml(s.a1);
    const tag2 = s.a2 ? typeTagHtml(s.a2) : '';
    return `<div class="dropdown-item" data-name="${s.n}">
      <span class="dd-thumb">${thumb}</span>
      <span class="item-name">${s.n}</span>
      ${tag1}${tag2}
      <span class="item-stage">${s.st||''}</span>
    </div>`;
  }

  // ── 应用选中精灵 ───────────────────────────────────────────
  function applySpirit(side, spirit) {
    applySpirit_global(side, spirit);
  }

  // ── 事件绑定 ───────────────────────────────────────────────
  input.addEventListener('focus', () => {
    // 点击后清空框内文字（露出原生占位提示）并弹出全量分组列表 —— 与「未选择精灵」完全一致；
    // 未做选择则失焦时由 bindClose 恢复已选名称（未修改 → 变回原样）
    if (isPickedDisplay(input)) setPickerValue(input, '');
    renderDropdown(input.value.trim());
    dd.classList.add('open');
    // 每次展开都回到顶部：不保留上次的滚动位置（display:none 时写 scrollTop 无效，必须在 open 之后）
    dd.scrollTop = 0;
    if (arrow) arrow.textContent = '▲';
    bindClose();
  });

  let _searchRaf = 0;
  input.addEventListener('input', () => {
    clearPickerPlaceholder(input);       // 开始输入 → 名称不再是占位符
    // rAF 节流（Phase 5）：连续按键只渲染最后一帧，占位符清理保持同步
    const q = input.value.trim();
    if (_searchRaf) cancelAnimationFrame(_searchRaf);
    _searchRaf = requestAnimationFrame(() => {
      _searchRaf = 0;
      renderDropdown(q);
      if (!dd.classList.contains('open')) {
        dd.classList.add('open');
        if (arrow) arrow.textContent = '▲';
      }
    });
  });

  bindPickerTypeReset(input);
  // 失焦未修改 → 名称显示回来（点击外部由 bindClose 负责，这里兼顾 Tab 离开）
  bindPickerBlurRestore(input, side + '-search-wrap', () => {
    const cur = side === 'atk' ? state.atk : state.def;
    return cur ? cur.n : '';
  });

  function bindClose() {
    const handler = e => {
      const wrap = document.getElementById(side + '-search-wrap');
      if (wrap && !wrap.contains(e.target)) {
        dd.classList.remove('open');
        if (arrow) arrow.textContent = '▼';
        // 失焦后若无有效精灵则恢复已选名称（有选中精灵 → 回到占位显示）
        const cur = side === 'atk' ? state.atk : state.def;
        if (cur) setPickerValue(input, cur.n);
        else clearPickerPlaceholder(input);
        document.removeEventListener('click', handler);
      }
    };
    setTimeout(() => document.addEventListener('click', handler), 0);
  }
}

// ================================================================
// 特性输入面板模板（Phase 4：消除 b/full × atk/def 四份复制 markup）
//   id 规则不变：traitInputId(kind, mode, side)（js/03 单一来源）与 trait-{side}-cond-{mode}，
//   readTraitOptsByMode 的前缀扫描逻辑因此不用改。
//   改通道输入框只需改这里的 K 表，四份面板同时生效。
// ================================================================
function traitPanelHTML(side, mode) {
  const isAtk = side === 'atk';
  const cls = isAtk ? 'atk' : 'def';
  const statWord = isAtk ? '攻击' : '防御';
  const manual = mode === 'b' ? '；可手动改' : '';
  const K = [
    { kind: 'mult',      label: '特性倍率',                      v: '1.0', min: '0',     max: '10',    step: '0.05', title: '' },
    { kind: 'powerMult', label: '特性威力倍率',                  v: '1.0', min: '0',     max: '10',    step: '0.05',
      title: (isAtk ? '特性' : '防方特性') + '带来的威力倍率（以「倍率−1」的增量并入威力层技能威力乘区）' + manual },
    { kind: 'powerAdd',  label: '特性威力',                      v: '0',   min: '-10000', max: '10000', step: '10',
      title: isAtk
        ? '特性带来的威力加成（威力层加法段' + (mode === 'b' ? '，如蒸汽膨胀 +10/次' : '') + '）' + manual
        : '防方特性带来的威力加成' },
    { kind: 'atkMult',   label: '特性' + statWord + '倍率',      v: '1.0', min: '0',     max: '10',    step: '0.05',
      title: (isAtk ? '特性' : '防方特性') + '带来的' + statWord + '百分比加成（' + statWord + '层）' + manual },
    { kind: 'atkAdd',    label: '特性' + statWord,               v: '0',   min: '-10000', max: '10000', step: '1',
      title: (isAtk ? '特性' : '防方特性') + '带来的' + statWord + '固定点数加成（' + statWord + '层）' + manual },
  ];
  const groups = K.map(k => {
    const hidden = k.kind === 'mult' ? '' : ' style="display:none"';
    const titleAttr = k.title ? ' title="' + k.title + '"' : '';
    return '                <span class="trait-mult-group" data-trait-input="' + k.kind + '"' + hidden + '>\n' +
      '                  <span class="trait-mult-label">' + k.label + '</span>\n' +
      '                  <input class="trait-mult-input ' + cls + '" type="number" id="' + traitInputId(k.kind, mode, side) + '" value="' + k.v + '" min="' + k.min + '" max="' + k.max + '" step="' + k.step + '" oninput="onTraitInputEdit(\'' + mode + '\',\'' + side + '\',\'' + k.kind + '\')"' + titleAttr + '>\n' +
      '                  <button class="trait-reset-btn" onclick="resetTraitInput(\'' + mode + '\',\'' + side + '\',\'' + k.kind + '\')">重置</button>\n' +
      '                </span>';
  }).join('\n');
  return '              <div class="trait-name-row ' + (isAtk ? 'atk-color' : 'def-color') + '" id="trait-' + side + '-name-' + mode + '">暂无特性</div>\n' +
    '              <div class="trait-desc-text" id="trait-' + side + '-desc-' + mode + '">选择' + (isAtk ? '攻击' : '防御') + '方精灵后自动显示</div>\n' +
    '              <div class="trait-mult-row" style="flex-wrap:wrap" id="trait-inputs-' + mode + '-' + side + '">\n' +
    groups + '\n' +
    '              </div>\n' +
    '              <div class="trait-cond-area" id="trait-' + side + '-cond-' + mode + '"></div>';
}

// 首次渲染时把 4 个特性面板（b/full × atk/def）注入各自容器。
// 调用点：js/08-fav-init.js 顶层 INIT（必须早于 DOMContentLoaded 里的
// updateTraitInputVisibility —— 后者要读这些输入框）。
function renderTraitPanels() {
  ['b', 'full'].forEach(mode => {
    ['atk', 'def'].forEach(side => {
      const body = document.getElementById('trait-panel-body-' + mode + '-' + side);
      if (body) body.innerHTML = traitPanelHTML(side, mode);
    });
  });
}
