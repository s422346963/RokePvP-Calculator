// js/08-fav-init.js — 收藏 / 主题 / 通用弹窗 / 全部事件绑定 / 顶层 init / DOMContentLoaded 入口
// 加载顺序位次 8。依赖 js/01~07 全部声明。⚠️ 顶层可执行语句（INIT / 监听器 / toggleTheme()）只允许出现在本文件。
// 本文件是最后一个脚本：其顶层语句在全部声明之后执行，与拆分前单文件行内脚本的执行时机一致。
// 点击组件外部关闭（组件内部点击由各自处理，这里直接放行）
document.addEventListener('mousedown', e => {
  if (e.target && e.target.closest && e.target.closest('.num-combo')) return;
  closeAllNumCombos();
});

// ============================================================
// INIT
// ============================================================
// 特性面板模板注入（Phase 4）：必须早于 DOMContentLoaded 里的 updateTraitInputVisibility
renderTraitPanels();
// buildTypeSelector('skill-type-selector-a'); // A 模式属性选择已隐藏（如需恢复取消注释）
buildTypeSelector('skill-type-selector-b');
setupSearch('atk');
setupSearch('def');
bindPickerTypeReset(document.getElementById('skill-combo-input'));   // 技能下拉：名称=占位显示，直接打字即清空重填
bindPickerBlurRestore(document.getElementById('skill-combo-input'), 'skill-combo-wrap',
  () => state.selectedSkillName || '');                             // 失焦未修改 → 恢复已选技能名
setAtkStat('patk', false);
setDefStat('pdef', false);
switchMode(state.mode); // 初始化模式状态

// 数值输入框（威力 / 连击 / 额外倍率 / 减伤 / 星陨层数 / FULL 技能槽）：聚焦即全选，方便直接输入
const SELECT_ON_FOCUS_SELECTOR =
  '.mult-box-input, .field-input, .fsk-hits, .fsk-power, .trait-mult-input, [id^="trait-opt-"], [id^="pwr-opt-"]';
document.addEventListener('focusin', e => {
  if (e.target.matches && e.target.matches(SELECT_ON_FOCUS_SELECTOR)) e.target.select();
});

function toggleTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  if (isLight) {
    document.documentElement.removeAttribute('data-theme');
    document.getElementById('theme-icon').textContent = '🌙';
    document.getElementById('theme-label').textContent = '夜间';
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
    document.getElementById('theme-icon').textContent = '☀️';
    document.getElementById('theme-label').textContent = '日间';
  }
}
toggleTheme(); // 默认日间

// ============================================================
// 收藏功能 (localStorage)
// ============================================================
const FAV_KEY = 'roko_favorites';

// IV input 的 element id（防御方物防 id 是 def-iv-def，其余规律统一）
function getIvElId(side, k) {
  if (side === 'def' && k === 'pdef') return 'def-iv-def';
  return side + '-iv-' + k;
}

function loadFavorites() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; }
  catch { return []; }
}
function saveFavorites(favs) {
  localStorage.setItem(FAV_KEY, JSON.stringify(favs));
}

// ── 通用弹窗（替代原生 prompt/confirm，风格与整体卡片一致）──
function escapeHtmlText(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

let appModalOnConfirm = null;

// cfg: { title, icon, bodyHtml, confirmText, danger, onConfirm(value) }
function openAppModal(cfg) {
  const overlay = document.getElementById('app-modal-overlay');
  if (!overlay) return;
  document.getElementById('app-modal-icon').textContent = cfg.icon || '⭐';
  document.getElementById('app-modal-title').textContent = cfg.title || '';
  document.getElementById('app-modal-body').innerHTML = cfg.bodyHtml || '';
  const confirmBtn = document.getElementById('app-modal-confirm');
  confirmBtn.textContent = cfg.confirmText || '确定';
  confirmBtn.className = 'app-modal-btn ' + (cfg.danger ? 'danger' : 'primary');
  appModalOnConfirm = cfg.onConfirm || null;
  overlay.hidden = false;
  const input = document.getElementById('app-modal-input');
  if (input) { input.focus(); input.select(); }
}

function closeAppModal() {
  const overlay = document.getElementById('app-modal-overlay');
  if (overlay) overlay.hidden = true;
  appModalOnConfirm = null;
}

function handleAppModalConfirm() {
  const fn = appModalOnConfirm;
  closeAppModal();
  if (!fn) return;
  const input = document.getElementById('app-modal-input');
  fn(input ? input.value : undefined);
}

(function initAppModal() {
  const overlay = document.getElementById('app-modal-overlay');
  if (!overlay) return;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeAppModal(); });
  document.getElementById('app-modal-cancel').addEventListener('click', closeAppModal);
  document.getElementById('app-modal-confirm').addEventListener('click', handleAppModalConfirm);
  document.addEventListener('keydown', e => {
    if (overlay.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeAppModal(); }
    else if (e.key === 'Enter') { e.preventDefault(); handleAppModalConfirm(); }
  });
})();

// 收藏单个精灵配置（含性格、IV、4技能）
function openSaveFavDialog(side) {
  const spirit = side === 'atk' ? state.atk : state.def;
  if (!spirit) {
    alert('请先选择' + (side === 'atk' ? '攻击方' : '防御方') + '精灵');
    return;
  }
  openAppModal({
    title: '收藏当前配置',
    icon: '⭐',
    bodyHtml:
      '<div class="app-modal-side-row">' +
        '<span class="app-modal-side-badge">精灵名称</span>' +
        '<span class="app-modal-spirit">' + escapeHtmlText(spirit.n) + '</span>' +
      '</div>' +
      '<label class="app-modal-label" for="app-modal-input">配置名称</label>' +
      '<input id="app-modal-input" class="app-modal-input" maxlength="24" value="' + escapeHtmlText(spirit.n) + '">' +
      '<div class="app-modal-hint">💡 将保存性格、个体值与 FULL 模式配招</div>',
    confirmText: '⭐ 收藏',
    onConfirm: name => saveFavConfig(side, spirit, name),
  });
}

function saveFavConfig(side, spirit, rawName) {
  const defaultName = spirit.n;
  const name = (rawName == null ? defaultName : rawName);

  // 保存性格与 IV
  const natureSel = document.getElementById(side + '-nature');
  const nature = natureSel ? natureSel.value : 'neutral';
  const ivIds = ['hp','patk','matk','pdef','mdef','spd'];
  const ivs = {};
  ivIds.forEach(k => {
    const el = document.getElementById(getIvElId(side, k));
    ivs[k] = el ? parseInt(el.value) || 0 : 0;
  });

  // 保存4个技能（仅 FULL 模式有意义，其他模式技能槽为空也正常保存）
  const skills = [];
  for (let i = 0; i < 4; i++) {
    const slot = fullState[side] && fullState[side][i];
    skills.push(slot ? { skillName: slot.skill.n, hits: slot.hits || 1 } : null);
  }

  const fav = {
    id: Date.now(),
    name: (name.trim() || defaultName),
    spiritName: spirit.n,
    nature,
    ivs,
    skills,
    createdAt: new Date().toLocaleDateString('zh-CN'),
  };

  const favs = loadFavorites();
  favs.unshift(fav);
  saveFavorites(favs);
  renderFavoriteGroup();
}

// 将精灵配置应用到指定侧
function loadFavConfig(fav, side) {
  const spirit = SPIRITS.find(s => s.n === fav.spiritName);
  if (!spirit) { alert('找不到精灵：' + fav.spiritName); return; }

  // ── 1. 写入 state，设置搜索框文字，隐藏下拉 ──
  if (side === 'atk') state.atk = Object.assign({}, spirit);
  else                state.def = Object.assign({}, spirit);
  const searchInput = document.getElementById(side + '-search');
  const dd = document.getElementById(side + '-dropdown');
  const arrow = document.getElementById(side + '-search-arrow');
  setPickerValue(searchInput, spirit.n);   // 走 setPickerValue：名称=占位显示，点击后清空并弹全量列表
  if (dd) dd.classList.remove('open');
  if (arrow) arrow.textContent = '▼';

  // 更换精灵后重置该侧能力等级（攻/防各两级）
  state[side + 'AtkLevel'] = 0;
  state[side + 'DefLevel'] = 0;
  refreshLevelUI(side);
  // 更换精灵后重置该侧特性面板（清手动覆盖 + 条件回默认 + 作废签名缓存），避免沿用旧精灵的特性值
  resetTraitPanelForSide(side);

  // ── 2. 性格 ──
  const natureSel = document.getElementById(side + '-nature');
  if (natureSel && fav.nature) natureSel.value = fav.nature;

  // ── 3. 个体值 ──
  if (fav.ivs) {
    ['hp','patk','matk','pdef','mdef','spd'].forEach(k => {
      const id = getIvElId(side, k);
      if (fav.ivs[k] !== undefined) setIv(id, fav.ivs[k]);
    });
  }

  // ── 4. 显示精灵卡片，重算属性（含性格与个体值） ──
  renderCard(side, side === 'atk' ? state.atk : state.def);
  recalcStats(side);
  if (side === 'atk') setAtkStat(state.skillType === 'physical' ? 'patk' : 'matk', false);
  if (side === 'def') setDefStat(state.skillType === 'physical' ? 'pdef' : 'mdef', false);
  syncModeBAutoFields();

  // ── 5. 技能：FULL 模式 ──
  for (let i = 0; i < 4; i++) {
    const slot = fav.skills && fav.skills[i];
    if (slot) {
      const sk = SKILLS.find(s => s.n === slot.skillName);
      fullState[side][i] = sk ? { skill: sk, hits: slot.hits || 1, power: sk.p } : null;
    } else {
      fullState[side][i] = null;
    }
  }
  buildFullSkillRows(side);

  // ── 6. 技能：Tab2/Tab3（仅攻击方，取第一个有效技能） ──
  if (side === 'atk') {
    const firstSkillSlot = fav.skills && fav.skills.find(Boolean);
    if (firstSkillSlot) {
      const sk = SKILLS.find(s => s.n === firstSkillSlot.skillName);
      if (sk) {
        applyQuickSkill(sk);
        const hitsB = document.getElementById('hits-input-b');
        if (hitsB && firstSkillSlot.hits) hitsB.value = firstSkillSlot.hits;
      }
    }
  }

  // ── 7. 刷新计算 ──
  // 切换精灵已清掉特性签名缓存与手动覆盖，这里再统一刷新一次特性面板，
  // 让 B / FULL 两侧都按新精灵的技能槽与技能重新填回自动值。
  autoUpdateTraitUI();
  calcFull();
  calc();
}

function deleteFav(id) {
  const fav = loadFavorites().find(f => String(f.id) === String(id));
  const label = fav ? ((fav.spiritName || fav.name) + (fav.nature && fav.nature !== 'neutral' ? ' | ' + fav.nature : '')) : '';
  openAppModal({
    title: '删除收藏',
    icon: '🗑️',
    bodyHtml:
      '<div class="app-modal-msg">确定删除收藏「' + escapeHtmlText(label) + '」？</div>' +
      '<div class="app-modal-hint warn">删除后无法恢复</div>',
    confirmText: '删除',
    danger: true,
    onConfirm: () => {
      const sid = String(id);
      saveFavorites(loadFavorites().filter(f => String(f.id) !== sid));
      renderFavoriteGroup();
    },
  });
}

const FAV_PANEL_KEY = 'roko_fav_panel_open';
const FAV_POS_KEY = 'roko_fav_panel_pos';
const FAV_PANEL_WIDTH = 240;

function isFavPanelOpen() {
  const v = localStorage.getItem(FAV_PANEL_KEY);
  // 默认不展示
  return v === '1';
}

function toggleFavPanel() {
  localStorage.setItem(FAV_PANEL_KEY, isFavPanelOpen() ? '0' : '1');
  syncFavToggleUI();
  renderFavoriteGroup();
}

function syncFavToggleUI() {
  const open = isFavPanelOpen();
  const btn = document.getElementById('fav-toggle-btn');
  if (btn) btn.classList.toggle('is-active', open);
}

function getDefaultFavPos() {
  const w = Math.min(FAV_PANEL_WIDTH, window.innerWidth - 16);
  return {
    left: Math.max(8, window.innerWidth - w + 12),
    top: 125,
  };
}

function loadFavPos() {
  try {
    const p = JSON.parse(localStorage.getItem(FAV_POS_KEY));
    if (p && typeof p.left === 'number' && typeof p.top === 'number' &&
        Number.isFinite(p.left) && Number.isFinite(p.top)) {
      return p;
    }
  } catch (_) {}
  return null;
}

function saveFavPos(pos) {
  localStorage.setItem(FAV_POS_KEY, JSON.stringify(pos));
}

function clampFavPos(left, top, panel) {
  const w = panel.offsetWidth || FAV_PANEL_WIDTH;
  const h = panel.offsetHeight || 80;
  const maxL = Math.max(0, window.innerWidth - Math.min(w, 48));
  const maxT = Math.max(0, window.innerHeight - 40);
  return {
    left: Math.min(Math.max(0, left), maxL),
    top: Math.min(Math.max(0, top), maxT),
  };
}

function applyFavPanelPos(panel) {
  if (!panel) return;
  const raw = loadFavPos() || getDefaultFavPos();
  const pos = clampFavPos(raw.left, raw.top, panel);
  panel.style.left = pos.left + 'px';
  panel.style.top = pos.top + 'px';
  panel.style.right = 'auto';
}

function setupFavPanelDrag() {
  const panel = document.getElementById('fav-panel');
  if (!panel || panel.dataset.dragReady === '1') return;
  panel.dataset.dragReady = '1';

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  panel.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.fav-drag-handle');
    if (!handle || e.target.closest('button, a, input')) return;
    if (e.button !== undefined && e.button !== 0) return;
    dragging = true;
    panel.classList.add('is-dragging');
    const rect = panel.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    try { panel.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  });

  panel.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const pos = clampFavPos(e.clientX - offsetX, e.clientY - offsetY, panel);
    panel.style.left = pos.left + 'px';
    panel.style.top = pos.top + 'px';
    panel.style.right = 'auto';
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove('is-dragging');
    try { panel.releasePointerCapture(e.pointerId); } catch (_) {}
    const left = parseFloat(panel.style.left);
    const top = parseFloat(panel.style.top);
    if (Number.isFinite(left) && Number.isFinite(top)) {
      saveFavPos({ left, top });
    }
  }

  panel.addEventListener('pointerup', endDrag);
  panel.addEventListener('pointercancel', endDrag);

  window.addEventListener('resize', () => {
    if (!panel.classList.contains('is-open')) return;
    applyFavPanelPos(panel);
  });
}

function renderFavoriteGroup() {
  const panel = document.getElementById('fav-panel');
  if (!panel) return;

  setupFavPanelDrag();

  const open = isFavPanelOpen();
  panel.classList.toggle('is-open', open);
  syncFavToggleUI();

  const favs = loadFavorites();
  let html = '<div class="fav-sidebar-title fav-drag-handle" title="按住拖动位置">' +
    '<span class="fav-drag-grip">⠿</span>' +
    '<span style="flex:1">⭐ 收藏夹 <span style="font-size:11px;color:var(--text2);font-weight:600">(' + favs.length + ')</span></span>' +
    '</div>';

  if (favs.length === 0) {
    html += '<div class="fav-empty">暂无收藏<br></div>';
    panel.innerHTML = html;
    if (open) applyFavPanelPos(panel);
    return;
  }

  html += '<div class="fav-grid">';
  favs.forEach((f, idx) => {
    const natureLabel = (!f.nature || f.nature === 'neutral') ? '普通' : f.nature;
    const spirit = (typeof SPIRITS !== 'undefined') ? SPIRITS.find(s => s.n === f.spiritName) : null;
    const imgUrl = spirit && spirit.img ? spirit.img : '';
    const bgHtml = imgUrl
      ? `<div class="fav-item-bg" style="background-image:url('${imgUrl.replace(/'/g, '%27')}')"></div>`
      : '';
    const label = (f.spiritName || f.name) + ' | ' + natureLabel;
    html += `
      <div class="fav-item" data-fav-idx="${idx}">
        ${bgHtml}
        <div class="fav-item-body">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
            <span class="fav-item-name" title="${label}" style="font-weight:700;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</span>
            <button class="fav-item-del" data-del-id="${f.id}" title="删除">✕</button>
          </div>
          <div style="display:flex;gap:6px">
            <button class="fav-save-btn fav-apply-atk" data-fav-idx="${idx}">攻击方</button>
            <button class="fav-save-btn fav-apply-def" data-fav-idx="${idx}">防御方</button>
          </div>
        </div>
      </div>`;
  });
  html += '</div>';
  panel.innerHTML = html;

  if (open) applyFavPanelPos(panel);

  // 事件绑定（避免 onclick 字符串解析）
  panel.querySelectorAll('.fav-apply-atk').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.favIdx);
      loadFavConfig(favs[idx], 'atk');
      btn.textContent = '已应用';
      setTimeout(() => { btn.textContent = '攻击方'; }, 1200);
    });
  });
  panel.querySelectorAll('.fav-apply-def').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.favIdx);
      loadFavConfig(favs[idx], 'def');
      btn.textContent = '已应用';
      setTimeout(() => { btn.textContent = '防御方'; }, 1200);
    });
  });
  panel.querySelectorAll('.fav-item-del').forEach(btn => {
    btn.addEventListener('click', () => deleteFav(btn.dataset.delId));
  });
}

// ============================================================
// FULL MODE 初始化
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initNumCombos();             // 数值下拉（其他额外倍率 / 星陨印记 / 减伤）
  buildFullSkillRows('atk');
  buildFullSkillRows('def');
  applyFullCondState('atk');   // 威力修正栏默认收起（▼）
  applyFullCondState('def');
  renderFavoriteGroup();
  // 未选精灵时：特性输入区只显示「特性倍率」（结算层），其余按规则显隐的输入框全部隐藏
  ['b', 'full'].forEach(m => {
    updateTraitInputVisibility(m, 'atk', null, null, null);
    updateTraitInputVisibility(m, 'def', null, null, null);
  });
});
