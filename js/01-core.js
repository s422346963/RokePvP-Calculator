// js/01-core.js — 纯逻辑层 1：搜索匹配 / 愿力冲击注入 / state / 面板值计算 / IV / 性格 / 属性克制 / 查表
// 加载顺序位次 1：必须排在 data/*.js 之后（愿力冲击注入依赖 SKILLS），js/02 之前。
// 依赖：PINYIN_MAP(data/pinyin.js)、SKILLS(data/skills.js)、TYPE_CHART(data/type.js)。
// ⚠️ 本文件含顶层可执行语句（愿力冲击 SKILLS.push）——这是拆分约定的唯一例外（数据注入类）。
// ⚠️ readIV/setIv/toggleIV 读写 DOM，属既有事实；后续可随 UI 层（js/05+）再迁。
function toPinyin(str){
  return Array.from(str).map(function(c){return PINYIN_MAP[c]||c;}).join("");
}
function toInitials(str){
  return Array.from(str).map(function(c){return PINYIN_MAP[c]?PINYIN_MAP[c][0]:c;}).join("");
}
function matchQuery(name, q){
  if(!q) return false;
  var ql = q.toLowerCase();
  if(name.indexOf(q)!==-1) return true;
  var py = toPinyin(name).toLowerCase();
  if(py.indexOf(ql)!==-1) return true;
  var ini = toInitials(name).toLowerCase();
  if(ini.indexOf(ql)!==-1) return true;
  return false;
}

// 愿力冲击（全属性，每属性一条，k="双攻"表示取较高攻）
['普通','草','火','水','光','地','冰','龙','电','毒','虫','武','翼','萌','幽','恶','机械','幻'].forEach(t => SKILLS.push({"n":"愿力冲击("+t+")","a":t,"p":80,"k":"双攻","c":2,"desc":"应对状态：本次技能威力变为2.5倍。"}));

// ============================================================
// STATE
// ============================================================
let state = {
  atk: null, def: null,
  atkStat: 'patk', defStat: 'pdef',
  atkAtkLevel: 0, atkDefLevel: 0,
  defAtkLevel: 0, defDefLevel: 0,
  skillType: 'physical',
  skillAttr: '普通',
  mode: 'A',
  selectedSkillName: '',
};

// ============================================================
// STAT CALCULATION  (species value → real stat)
// HP:    (sv*1.7 + iv*0.85 + 70) * nature + 100
// Other: (sv*1.1 + iv*0.55 + 10) * nature + 50
// IV range: 0–100
// 验证: 针叶巡林(HP:348),水灵(HP:501),迪莫(防御:175)
// ============================================================
function calcRealStat(sv, iv, nature, isHp) {
  iv = Math.max(0, Math.min(100, iv));
  // 种族值=105、无个体(iv=0)、无性格加成(nature=1.0) 时，中间值向下取整
  const baseRounder = (sv === 105 && iv === 0 && nature === 1.0) ? Math.floor : Math.round;
  if (isHp) {
    const base = baseRounder(sv * 1.7 + iv * 0.85 + 70);
    return Math.round(base * nature + 100);
  }
  const base = baseRounder(sv * 1.1 + iv * 0.55 + 10);
  return Math.round(base * nature + 50);
}

function readIV(id) {
  // 修复：0 是有效值，不能用 || fallback，需单独判断空字符串
  const raw = document.getElementById(id).value;
  if (raw === '' || raw === null) return 50; // 空时默认50
  return Math.max(0, Math.min(100, parseInt(raw, 10) || 0));
}

// 设置个体值按钮的显示值与内部 value（按钮用 value 属性存储，textContent 显示）
function setIv(id, v) {
  const el = document.getElementById(id);
  if (!el) return;
  v = Math.max(0, Math.min(100, parseInt(v, 10) || 0));
  el.value = v;
  el.textContent = v;
}

// 点击个体值按钮：当前为 0 则切到 60，否则（含 60）切回 0
function toggleIV(id, side) {
  const el = document.getElementById(id);
  if (!el) return;
  const cur = parseInt(el.value, 10) || 0;
  setIv(id, cur === 0 ? 60 : 0);
  recalcStats(side);
  calc();
}

// 性格映射表：每种性格对各属性的倍率
// 格式：{patk, matk, pdef, mdef, spd, hp} 值为 1.2/0.9/1.0
// ============================================================
const NATURE_TABLE = {
  neutral: {patk:1.0, matk:1.0, pdef:1.0, mdef:1.0, spd:1.0, hp:1.0},
  // +生命
  '沉默':   {patk:0.9, matk:1.0, pdef:1.0, mdef:1.0, spd:1.0, hp:1.2},
  '平和':   {patk:1.0, matk:0.9, pdef:1.0, mdef:1.0, spd:1.0, hp:1.2},
  '忧郁':   {patk:1.0, matk:1.0, pdef:0.9, mdef:1.0, spd:1.0, hp:1.2},
  '粗心':   {patk:1.0, matk:1.0, pdef:1.0, mdef:0.9, spd:1.0, hp:1.2},
  '踏实':   {patk:1.0, matk:1.0, pdef:1.0, mdef:1.0, spd:0.9, hp:1.2},
  // +物攻
  '大胆':   {patk:1.2, matk:1.0, pdef:0.9, mdef:1.0, spd:1.0, hp:1.0},
  '调皮':   {patk:1.2, matk:1.0, pdef:1.0, mdef:0.9, spd:1.0, hp:1.0},
  '勇敢':   {patk:1.2, matk:1.0, pdef:1.0, mdef:1.0, spd:0.9, hp:1.0},
  '逞强':   {patk:1.2, matk:1.0, pdef:1.0, mdef:1.0, spd:1.0, hp:0.9},
  '固执':   {patk:1.2, matk:0.9, pdef:1.0, mdef:1.0, spd:1.0, hp:1.0},
  // +魔攻
  '聪明':   {patk:0.9, matk:1.2, pdef:1.0, mdef:1.0, spd:1.0, hp:1.0},
  '专注':   {patk:1.0, matk:1.2, pdef:0.9, mdef:1.0, spd:1.0, hp:1.0},
  '偏执':   {patk:1.0, matk:1.2, pdef:1.0, mdef:0.9, spd:1.0, hp:1.0},
  '冷静':   {patk:1.0, matk:1.2, pdef:1.0, mdef:1.0, spd:0.9, hp:1.0},
  '理性':   {patk:1.0, matk:1.2, pdef:1.0, mdef:1.0, spd:1.0, hp:0.9},
  // +速度
  '胆小':   {patk:0.9, matk:1.0, pdef:1.0, mdef:1.0, spd:1.2, hp:1.0},
  '开朗':   {patk:1.0, matk:0.9, pdef:1.0, mdef:1.0, spd:1.2, hp:1.0},
  '急躁':   {patk:1.0, matk:1.0, pdef:0.9, mdef:1.0, spd:1.2, hp:1.0},
  '莽撞':   {patk:1.0, matk:1.0, pdef:1.0, mdef:0.9, spd:1.2, hp:1.0},
  '热情':   {patk:1.0, matk:1.0, pdef:1.0, mdef:1.0, spd:1.2, hp:0.9},
  // +物防
  '稳重':   {patk:0.9, matk:1.0, pdef:1.2, mdef:1.0, spd:1.0, hp:1.0},
  '天真':   {patk:1.0, matk:0.9, pdef:1.2, mdef:1.0, spd:1.0, hp:1.0},
  '悠闲':   {patk:1.0, matk:1.0, pdef:1.2, mdef:1.0, spd:0.9, hp:1.0},
  '懒散':   {patk:1.0, matk:1.0, pdef:1.2, mdef:0.9, spd:1.0, hp:1.0},
  '坦率':   {patk:1.0, matk:1.0, pdef:1.2, mdef:1.0, spd:1.0, hp:0.9},
  // +魔防
  '警惕':   {patk:0.9, matk:1.0, pdef:1.0, mdef:1.2, spd:1.0, hp:1.0},
  '害羞':   {patk:1.0, matk:0.9, pdef:1.0, mdef:1.2, spd:1.0, hp:1.0},
  '温顺':   {patk:1.0, matk:1.0, pdef:0.9, mdef:1.2, spd:1.0, hp:1.0},
  '慎重':   {patk:1.0, matk:1.0, pdef:1.0, mdef:1.2, spd:0.9, hp:1.0},
  '焦虑':   {patk:1.0, matk:1.0, pdef:1.0, mdef:1.2, spd:1.0, hp:0.9},
};

function getNature(side) {
  const key = document.getElementById(side + '-nature').value;
  return NATURE_TABLE[key] || NATURE_TABLE.neutral;
}

// ============================================================
// HELPERS
// ============================================================
function levelMult(lv) {
  return lv >= 0 ? 1 + lv * 0.1 : 1 / (1 + Math.abs(lv) * 0.1);
}

function getTypeEff(atkType, d1, d2) {
  const ac = TYPE_CHART[atkType];
  if (!ac) return 1;

  // Wiki 字段语义（来自 wiki.biligame.com/rocom/克制计算器）：
  //   攻击方字段：
  //     strong  = 造成伤害增加 → 攻击这些防御属性时 ×2
  //     resist  = 造成伤害降低 → 攻击这些防御属性时 ×0.5
  //   防御方字段：
  //     weak       = 受到伤害增加 → 被这些攻击属性打时 ×2
  //     vulnerable = 受到伤害降低 → 被这些攻击属性打时 ×0.5
  // 优先级：攻击方 strong/resist 先查，防御方 weak/vulnerable 补充
  function singleEff(dt) {
    if (!dt) return 1;
    const dc = TYPE_CHART[dt];
    // 攻击方视角优先
    if (ac.strong?.includes(dt)) return 2;
    if (ac.resist?.includes(dt)) return 0.5;
    // 防御方视角补充
    if (dc?.weak?.includes(atkType)) return 2;
    if (dc?.vulnerable?.includes(atkType)) return 0.5;
    return 1;
  }

  const r1 = singleEff(d1);
  if (r1 === 0) return 0;
  const r2 = d2 ? singleEff(d2) : 1;
  if (r2 === 0) return 0;

  const raw = r1 * r2;
  if (raw >= 4) return 3;           // 双重克制上限 ×3
  if (raw > 0 && raw <= 0.25) return 0.25; // 双重抵抗下限 ×0.25
  return raw;
}

function hasStab(spirit, attr) {
  return spirit && (spirit.a1 === attr || (spirit.a2 && spirit.a2 === attr));
}

const f1 = v => String(Math.floor(v));
const f2 = v => v.toFixed(2);
const f3 = v => v.toFixed(3);

// 闪击：速度差→威力查表（攻方速度 - 防方速度）
const SPEED_DIFF_TABLE = [
  { min: -Infinity, max: 0,   p: 60,  label: '≤ 0（不快于对方）' },
  { min: 1,   max: 30,  p: 80,  label: '1 ~ 30'   },
  { min: 31,  max: 60,  p: 100, label: '31 ~ 60'  },
  { min: 61,  max: 90,  p: 120, label: '61 ~ 90'  },
  { min: 91,  max: 120, p: 140, label: '91 ~ 120' },
  { min: 121, max: 150, p: 150, label: '121 ~ 150' },
  { min: 151, max: 180, p: 160, label: '151 ~ 180' },
  { min: 181, max: 210, p: 170, label: '181 ~ 210' },
  { min: 211, max: 240, p: 180, label: '211 ~ 240' },
  { min: 241, max: 270, p: 190, label: '241 ~ 270' },
  { min: 271, max: Infinity, p: 200, label: '≥ 271' }
];
// 鸣沙陷阱：物防差→威力查表（攻方物防 - 防方物防），区间与闪击相同
const PDEF_DIFF_TABLE = SPEED_DIFF_TABLE;

function diffTableLookup(table, atk, def) {
  const diff = atk - def;
  for (const row of table) {
    if (diff >= row.min && diff <= row.max) return { p: row.p, diff };
  }
  return { p: table[table.length - 1].p, diff };
}

// 魔能爆：能量→威力表
const MANA_BURST_TABLE = [
  [0,45],[1,70],[2,90],[3,110],[4,135],[5,155],[6,165],[7,180],[8,190],[9,200],[10,210]
];

// ================================================================
// 搜索索引（Phase 5）：懒建一次，避免每次按键对 622 只精灵现算拼音
//   语义与 matchQuery 完全一致：中文子串（原始大小写）/ 全拼 / 首字母（均转小写）
//   懒建原因：SORTED_SPIRITS 定义在 js/05-card.js（本文件之后加载），
//   首次搜索输入时所有脚本已加载完毕，此时建索引安全。
// ================================================================
let _spiritSearchIndex = null;
function getSpiritSearchIndex() {
  if (_spiritSearchIndex) return _spiritSearchIndex;
  const list = (typeof SORTED_SPIRITS !== 'undefined') ? SORTED_SPIRITS : SPIRITS;
  _spiritSearchIndex = list.map(s => ({
    s: s,
    py: toPinyin(s.n).toLowerCase(),
    ini: toInitials(s.n).toLowerCase(),
  }));
  return _spiritSearchIndex;
}
function filterSpiritsByQuery(q) {
  if (!q) return [];
  const ql = q.toLowerCase();
  const out = [];
  getSpiritSearchIndex().forEach(e => {
    if (e.s.n.indexOf(q) !== -1 || e.py.indexOf(ql) !== -1 || e.ini.indexOf(ql) !== -1) out.push(e.s);
  });
  return out;
}
