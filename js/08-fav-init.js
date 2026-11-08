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
syncWeatherSelects();   // 天气下拉与 state.weather 对齐（默认「无」）
syncMarkUI();           // 进攻方印记与 state 对齐（默认「无」，层数禁用）
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
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
    document.getElementById('theme-icon').textContent = '☀️';
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
      '<div class="app-modal-hint">💡 将保存性格、个体值与技能配招（含当前模式的默认推荐技能）</div>',
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

  // 保存4个技能：FULL 模式取技能槽，其他模式槽为空时见下方兜底
  const skills = [];
  for (let i = 0; i < 4; i++) {
    const slot = fullState[side] && fullState[side][i];
    skills.push(slot ? { skillName: slot.skill.n, hits: slot.hits || 1 } : null);
  }

  // 第 1 槽为空时补「当前默认技能」：B 模式的技能（含自动套用的 PVP 推荐 s[0]）只存在
  // state.selectedSkillName、不写 fullState，直接保存会得到 [null×4] → 收藏后没有推荐技能。
  //   B 模式攻方优先取当前技能（手动选过则以手动为准），其余情况取该侧精灵的 PVP 推荐 s[0]。
  if (!skills[0]) {
    let sk = null, hits = null;
    if (side === 'atk' && state.mode === 'B' && state.selectedSkillName) {
      sk = SKILLS.find(s => s.n === state.selectedSkillName) || null;
      const hitsEl = document.getElementById('hits-input-b');
      hits = hitsEl ? Math.max(1, parseInt(hitsEl.value) || 1) : 1;
    }
    if (!sk && typeof pvpRecommendedSkill === 'function') sk = pvpRecommendedSkill(side);
    if (sk) skills[0] = { skillName: sk.n, hits: hits || skillDefaultHits(sk) };
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
  // 旧收藏未带技能时，补上该精灵的 PVP 推荐 s[0]（与新收藏、选精灵时的默认值一致）
  if (!fullState[side][0]) applyPvpRecommendedFullSkill(side, false);
  buildFullSkillRows(side);

  // ── 6. 技能：Tab2/Tab3（仅攻击方，取第一个有效技能） ──
  if (side === 'atk') {
    const firstSkillSlot = fav.skills && fav.skills.find(Boolean);
    const favSk = firstSkillSlot ? (SKILLS.find(s => s.n === firstSkillSlot.skillName) || null) : null;
    // 旧收藏（skills 全 null）或收藏里的技能名已失效时，整段跳过会沿用上一只精灵的技能，
    // 表现为「收藏夹切精灵但技能不变」：回落到当前精灵 PVP 推荐 s[0]，
    // 与搜索框直接选精灵的行为一致；收藏带有效技能时仍以收藏为准。
    // 切精灵时技能总是同步：收藏带技能用收藏的，否则回落到该精灵 PVP 推荐 s[0]
    const sk = favSk || pvpRecommendedSkill('atk');
    if (sk) {
      applyQuickSkill(sk);
      const hitsB = document.getElementById('hits-input-b');
      if (hitsB && favSk && firstSkillSlot.hits) hitsB.value = firstSkillSlot.hits;
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

// ── 模式 A/B 吸底结果条：滚动/缩放时重判显隐，点击回到伤害明细 ──
function initResultDock() {
  const dock = document.getElementById('result-dock');
  if (!dock) return;
  dock.addEventListener('click', () => {
    const rp = document.getElementById('result-panel');
    if (rp) rp.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  let ticking = false;
  const onViewportChange = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      syncResultDockVisibility();
    });
  };
  window.addEventListener('scroll', onViewportChange, { passive: true });
  window.addEventListener('resize', onViewportChange);
  syncResultDockVisibility();
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
  initResultDock();            // 吸底结果条（模式 A/B）
  initMerchantModal();         // 远行商人弹窗（关闭 / 遮罩 / 刷新 / ESC）
  // 未选精灵时：特性输入区只显示「特性倍率」（结算层），其余按规则显隐的输入框全部隐藏
  ['b', 'full'].forEach(m => {
    updateTraitInputVisibility(m, 'atk', null, null, null);
    updateTraitInputVisibility(m, 'def', null, null, null);
  });
});

// ============================================================
// 远行商人（顶栏 tab → 弹窗 → https://oiapi.net/api/rocom/shop）
// 渲染按 merchant-float-body / merchant-offers / merchant-goods 模板结构；
// 接口数据映射：is_permanent → 活动全天商品，其余按 all_rounds 归入四小时轮换。
// ============================================================
const MERCHANT_API = 'https://oiapi.net/api/rocom/shop';
const MERCHANT_CACHE_KEY = 'roko_merchant_shop';   // localStorage: { fetchedAt, expiresAt, data }
let merchantReqSeq = 0;              // 只接受最后一次请求的结果，避免旧响应覆盖
let merchantCountdownTimer = null;   // 缓存到期（轮换截止）后自动刷新的定时器

function merchantEsc(v) { return escapeHtmlText(v == null ? '' : v); }

// 图片为带签名的外链，只接受 http(s)，其余降级为占位图
function merchantSafeUrl(u) {
  return (typeof u === 'string' && /^https?:\/\//i.test(u)) ? u : '';
}

function merchantGoodHtml(it) {
  if (!it) return '';
  const url = merchantSafeUrl(it.icon_url);
  const img = url
    ? '<img src="' + merchantEsc(url) + '" alt="' + merchantEsc(it.name) + '" loading="lazy" referrerpolicy="no-referrer">'
    : '<span class="merchant-good-fallback" aria-hidden="true">🎁</span>';
  const limit = Number(it.buy_limit);
  return '<li class="merchant-good">' + img +
    '<div class="merchant-good-copy">' +
      '<strong title="' + merchantEsc(it.name) + '">' + merchantEsc(it.name) + '</strong>' +
      (limit > 0 ? '<span class="merchant-good-limit">限购 ' + limit + ' 份</span>' : '') +
    '</div></li>';
}

function merchantGoodsHtml(items) {
  if (!items || !items.length) return '<p class="merchant-goods-empty">该时段暂无商品</p>';
  return '<ul class="merchant-goods is-compact">' + items.map(merchantGoodHtml).join('') + '</ul>';
}

function merchantTimeParts(time) {
  const p = String(time || '').split(/\s*[-–—]\s*/);
  return { start: p[0] || '--:--', end: p[1] || '' };
}

function merchantUpdateText(s) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(String(s || ''));
  return m ? m[1] + ' ' + m[2] : String(s || '');
}

// 单个轮换时段卡片：state = 'current' | 'past' | 'future'
function merchantSlotHtml(r, state) {
  const t = merchantTimeParts(r.time);
  let status = '';
  if (state === 'current') status = '<span class="merchant-slot-now">售卖中</span>';
  else if (state === 'past') status = '<span class="merchant-slot-past">已结束</span>';
  else status = '<span class="merchant-slot-future">未开售</span>';
  const items = (r.items || []).filter(it => it && !it.is_permanent);
  return '<div class="merchant-slot is-ready' + (state === 'current' ? ' is-current' : '') +
      (state === 'past' ? ' is-past' : '') + '">' +
      '<header class="merchant-slot-heading"><h4>' + merchantEsc(t.start) +
        (t.end ? '<span>—' + merchantEsc(t.end) + '</span>' : '') + '</h4>' +
        '<small>' + status + '</small></header>' +
      merchantGoodsHtml(items) +
    '</div>';
}

// 纯字符串渲染，DOM 结构对齐模板：
// 活动全天商品 → 当前时段（售卖中）→ 四小时轮换（其余时段）
function renderMerchantOffers(data) {
  const rounds = (Array.isArray(data.all_rounds) && data.all_rounds.length)
    ? data.all_rounds
    : (data.current_round ? [data.current_round] : []);
  const current = data.current_round || null;

  // 全天商品：所有轮次里 is_permanent 的商品按名称去重
  const permanent = new Map();
  const collectPermanent = arr => (arr || []).forEach(it => {
    if (it && it.is_permanent && !permanent.has(it.name)) permanent.set(it.name, it);
  });
  if (current) collectPermanent(current.items);
  rounds.forEach(r => collectPermanent(r.items));

  // 全天商品卡：与「售卖中」同款卡片（标题 + 右侧「全天」徽标 + 商品列表）
  const allDayHtml =
    '<div class="merchant-slot is-ready is-all-day" aria-label="活动全天商品">' +
      '<header class="merchant-slot-heading"><h4>活动全天商品</h4>' +
        '<small><span class="merchant-all-day-badge">全天</span></small></header>' +
      merchantGoodsHtml(Array.from(permanent.values())) +
    '</div>';

  // 当前时段单独成块，夹在全天商品与四小时轮换之间
  const currentRound = rounds.find(r => r.is_current || (current && r.round === current.round)) || current;
  const currentHtml = currentRound ? merchantSlotHtml(currentRound, 'current') : '';

  // 四小时轮换：其余时段（已结束 / 未开售）
  const otherHtml = rounds.filter(r => r !== currentRound &&
      !(current && r.round === current.round))
    .map(r => merchantSlotHtml(r,
      (current && Number(r.round) < Number(current.round)) ? 'past' : 'future'))
    .join('');

  const rotationHtml =
    '<section class="merchant-rotation" aria-label="四小时轮换商品">' +
      '<header class="merchant-offer-heading"><h3>四小时轮换</h3><span>北京时间</span></header>' +
      (otherHtml || '<p class="merchant-goods-empty">暂无其它时段</p>') +
    '</section>';

  return '<div class="merchant-float-body"><div class="merchant-offers is-compact">' +
    allDayHtml + currentHtml + rotationHtml + '</div></div>';
}

// 图片加载失败（外链带签名，可能过期 / 防盗链）→ 替换为 🎁 占位
function merchantBindImageFallback(root) {
  root.querySelectorAll('.merchant-good img').forEach(img => {
    const fail = () => {
      if (img.dataset.merchantFailed === '1') return;
      img.dataset.merchantFailed = '1';
      const ph = document.createElement('span');
      ph.className = 'merchant-good-fallback';
      ph.setAttribute('aria-hidden', 'true');
      ph.textContent = '🎁';
      if (img.parentNode) img.parentNode.replaceChild(ph, img);
    };
    img.addEventListener('error', fail);
    // 懒加载图片尚未开始请求时 complete 也可能为 true，需确认已尝试加载再降级
    if (img.complete && img.currentSrc && img.naturalWidth === 0) fail();
  });
}

// ── 本地缓存：有效期 = 本轮截止时间（接口 next_round.countdown）──
// 打开弹窗优先读缓存；只有缓存过期、手动刷新、到点自动刷新才发请求。
function merchantCacheTtlSec(d) {
  const c = d && d.next_round && Number(d.next_round.countdown);
  // 服务端没给 countdown 时兜底 5 分钟；下限 5 秒防止异常值导致频繁请求
  return (Number.isFinite(c) && c > 0) ? Math.max(5, Math.floor(c)) : 300;
}

function merchantReadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(MERCHANT_CACHE_KEY));
    return (c && c.data && Number.isFinite(c.expiresAt)) ? c : null;
  } catch (_) { return null; }
}

function merchantWriteCache(d) {
  const now = Date.now();
  const c = { fetchedAt: now, expiresAt: now + merchantCacheTtlSec(d) * 1000, data: d };
  try { localStorage.setItem(MERCHANT_CACHE_KEY, JSON.stringify(c)); } catch (_) {}
  return c;
}

function merchantCacheRemainSec(c) {
  return Math.max(0, Math.floor((c.expiresAt - Date.now()) / 1000));
}

function merchantStopExpireTimer() {
  if (merchantCountdownTimer) { clearTimeout(merchantCountdownTimer); merchantCountdownTimer = null; }
}

// 缓存到期（轮换截止）自动重新请求：一次性定时器，不做每秒轮询
function merchantStartExpireTimer(expiresAt, onExpire) {
  merchantStopExpireTimer();
  const delay = expiresAt - Date.now();
  if (delay <= 0) {
    if (typeof onExpire === 'function') onExpire();
    return;
  }
  merchantCountdownTimer = setTimeout(() => {
    merchantCountdownTimer = null;
    // 超过 setTimeout 上限（约 24.8 天）时并未真正到期，重新安排
    if (Date.now() < expiresAt) { merchantStartExpireTimer(expiresAt, onExpire); return; }
    if (typeof onExpire === 'function') onExpire();
  }, Math.min(delay, 2147483647));
}

function merchantSetStatus(kind, msg) {
  const body = document.getElementById('merchant-modal-body');
  if (!body) return;
  if (kind === 'loading') {
    body.innerHTML = '<div class="merchant-status"><span class="merchant-spinner"></span>正在获取远行商人商品…</div>';
  } else {
    body.innerHTML = '<div class="merchant-status is-error"><div>⚠️ ' + merchantEsc(msg) +
      '</div><button type="button" class="merchant-refresh-btn" data-merchant-retry="1">↻ 重新获取</button></div>';
  }
}

function merchantRenderData(d) {
  const body = document.getElementById('merchant-modal-body');
  const sub = document.getElementById('merchant-modal-sub');
  if (!body) return body;
  body.innerHTML = renderMerchantOffers(d);
  merchantBindImageFallback(body);
  if (sub) sub.textContent = d.schedule || '每天 8:00 - 24:00，每4小时刷新';
  return body;
}

// 底部只显示数据日期与更新时间，不向用户暴露缓存有效期
function merchantUpdateFooter(d, warn) {
  const upd = document.getElementById('merchant-update');
  if (!upd) return;
  let text = '数据日期 ' + (d.date || '—') +
    (d.last_update ? ' · 更新于 ' + merchantUpdateText(d.last_update) : '');
  if (warn) text += ' · ' + warn;
  upd.textContent = text;
  upd.classList.toggle('is-warn', !!warn);
}

// force=true：忽略缓存强制拉取；silent=true：保留当前内容静默换新（到点自动刷新用）
function loadMerchantData(force, silent) {
  const seq = ++merchantReqSeq;
  const upd = document.getElementById('merchant-update');
  merchantStopExpireTimer();
  if (upd && !silent) { upd.textContent = ''; upd.classList.remove('is-warn'); }

  // 命中「未到轮换截止时间」的缓存 → 直接渲染，不发请求
  if (!force) {
    const cached = merchantReadCache();
    if (cached && merchantCacheRemainSec(cached) > 0) {
      merchantRenderData(cached.data);
      merchantUpdateFooter(cached.data);
      merchantStartExpireTimer(cached.expiresAt, () => loadMerchantData(true, true));
      return;
    }
  }

  if (!silent) merchantSetStatus('loading');
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, 10000);
  fetch(MERCHANT_API, ctrl ? { signal: ctrl.signal, cache: 'no-store' } : { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(json => {
      clearTimeout(timer);
      if (seq !== merchantReqSeq) return;
      if (!json || !json.data) throw new Error((json && json.message) || '接口返回异常');
      const cache = merchantWriteCache(json.data);
      merchantRenderData(cache.data);
      merchantUpdateFooter(cache.data);
      // 到本轮截止时间自动重新请求
      merchantStartExpireTimer(cache.expiresAt, () => loadMerchantData(true, true));
    })
    .catch(err => {
      clearTimeout(timer);
      if (seq !== merchantReqSeq) return;
      // 兜底：缓存还在就照常展示，且不自动重试（避免失败时反复请求）
      const cached = merchantReadCache();
      if (cached) {
        merchantRenderData(cached.data);
        merchantUpdateFooter(cached.data, '刷新失败，可点「刷新」重试');
      } else {
        merchantSetStatus('error', err && err.name === 'AbortError'
          ? '请求超时，请稍后重试'
          : ((err && err.message) || '网络异常，请稍后重试'));
      }
    });
}

function openMerchantModal() {
  const overlay = document.getElementById('merchant-modal-overlay');
  if (!overlay) return;
  overlay.hidden = false;
  if (document.body && document.body.classList) document.body.classList.add('merchant-modal-open');
  loadMerchantData(false);   // 打开时走缓存，不重复请求
  const closeBtn = document.getElementById('merchant-modal-close');
  if (closeBtn) closeBtn.focus();
}

function closeMerchantModal() {
  const overlay = document.getElementById('merchant-modal-overlay');
  if (overlay) overlay.hidden = true;
  if (document.body && document.body.classList) document.body.classList.remove('merchant-modal-open');
  merchantStopExpireTimer();
  merchantReqSeq++;   // 让在途请求的结果作废
}

function initMerchantModal() {
  const overlay = document.getElementById('merchant-modal-overlay');
  if (!overlay) return;
  overlay.addEventListener('click', e => {
    if (e.target === overlay) { closeMerchantModal(); return; }
    if (e.target.closest && e.target.closest('[data-merchant-retry]')) loadMerchantData(true);
  });
  const closeBtn = document.getElementById('merchant-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', closeMerchantModal);
  const refreshBtn = document.getElementById('merchant-refresh-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', () => loadMerchantData(true));
  document.addEventListener('keydown', e => {
    if (!overlay.hidden && e.key === 'Escape') { e.preventDefault(); closeMerchantModal(); }
  });
}
