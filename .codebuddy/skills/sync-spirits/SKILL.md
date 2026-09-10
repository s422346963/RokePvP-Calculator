---
name: sync-spirits
description: 从 wiki 精灵图鉴页面（https://wiki.biligame.com/nrc/精灵图鉴）批量同步精灵数据。先抓取图鉴页拿到全部精灵基础信息（编号/名称/属性/图片/详情链接），再逐个访问详情页解析资质（生命/物攻/魔攻/物防/魔防/速度）、特性与属性，最后写入 data/spirits.js。当用户要求同步/更新精灵数据、补充新精灵、按编号范围同步时使用。
---

# Sync Spirits

从 `https://wiki.biligame.com/nrc/%E7%B2%BE%E7%81%B5%E5%9B%BE%E9%89%B4`（精灵图鉴）同步精灵数据到 `data/spirits.js`。

> 旧源 `rocom` 已下线，数据迁移到 `nrc` 域。**图鉴页结构完全重写**（`npc-card` 卡片），但**详情页复用了旧 `roco-` 结构**（资质/特性），所以采用两步法：图鉴页拿基础信息 + 详情链接，再逐个访问详情页取完整字段。

## 触发方式

- "同步从 N 号开始的精灵数据"
- "从 N 号开始同步精灵"
- "同步 N-M 号的精灵数据"
- "同步 N 到 M 号的精灵"
- "全量同步精灵 / 清空数据后重新全量同步"
- "更新/补充精灵数据"

## 数据来源与结构

### Step 1 · 精灵图鉴页（`nrc` 域）

每个精灵是一张 `div.npc-card` 卡片：

```html
<div class="npc-card" data-id="pet_000004" data-number="001" aria-label="001 迪莫"
     data-stage="1" data-form="main" data-shiny="no" data-season="none" data-type="光">
  <span class="npc-card-target"><a href="/nrc/%E8%BF%AA%E8%8E%AB" title="迪莫">001 迪莫</a></span>
  <div class="npc-number">001</div>
  <div class="npc-stage">一阶</div>
  <div class="npc-art"><div class="npc-art-normal"><img src=".../xxx.png"/></div>...</div>
  <div class="npc-name">迪莫</div>
  <div class="npc-card-types"><div class="npc-type" title="光系">...</div></div>
</div>
```

- `data-number` → 编号（补零为 3 位）；`.npc-name` → 名称；`.npc-stage` → 阶段文本
- `.npc-card-types .npc-type` 的 `title`（如「光系」）→ 属性，去「系」字得裸属性；双属性会出现两个 `.npc-type`
- `.npc-art-normal img` → 图片（立绘，回退到 `.npc-art-head img`）
- `.npc-card-target a` → 详情页链接（相对路径，需拼 `https://wiki.biligame.com`）
- 注意：形态精灵（如 圣光迪莫 / 圣草迪莫）是**独立卡片**，拥有各自的 `no`（常与本体相同）与详情页，按 `no + 名称` 去重，均视为不同精灵
- 图鉴总数 622 张卡（含形态，实测于 2026-09）

### Step 2 · 精灵详情页（`/nrc/<名称>`）

示例 `https://wiki.biligame.com/nrc/%E8%BF%AA%E8%8E%AB`，复用旧 `roco-` 结构：

```html
<div class="roco-stat-list">
  <div class="roco-stat"><span class="roco-stat-name">生命</span>
    <span class="roco-stat-val" data-val="120">0</span></div>   <!-- 真实数值在 data-val，文本是占位 0 -->
  ...（攻击/魔攻/物防/魔防/速度）
</div>
<div class="roco-feature">
  <span class="roco-feature-name">最好的伙伴</span>
  <div class="roco-feature-desc">造成克制伤害后，获得攻防速+20%，并回复2能量。</div>
</div>
<span class="roco-type">光</span>   <!-- 可能多个，裸属性 -->
```

字段映射（写入 `data/spirits.js`）：

| 字段 | 来源 |
|---|---|
| `no` | 图鉴 `data-number`（3 位补零） |
| `n` | 图鉴 `.npc-name` |
| `hp/pa/ma/pd/md/sp` | 详情 `.roco-stat`：按 `.roco-stat-name` 对应，数值取 `.roco-stat-val` 的 `data-val`（文本固定为 0，不可用） |
| `a1`/`a2` | 详情 `.roco-type`（首个/次个，裸属性）；详情为空时回退到图鉴属性 |
| `tr` | 详情 `.roco-feature-name` |
| `tr_desc` | 详情 `.roco-feature-desc` |
| `st` | 图鉴的特殊形态/阶段文本（`.npc-form` 显示文本 + `.npc-stage` 拼接，中性值如「一阶」「首领形态」「本来的样子」不记录，实际值如「首领」「蓬松的样子」「急急急鸭/首领」；普通精灵为空 `""`） |
| `img` | 图鉴 `.npc-art-normal img` src |

> **抓取方式（统一 requests）**：详情页用 `requests` 抓取（快，~0.x s/页），wiki 偶发 `567` 由指数退避重试吸收；个别页面持续被拦截（567 / 请求已被拦截）时稍后重跑即可（已缓存的秒过，只补抓失败的）。解析逻辑用 BeautifulSoup 取 `roco-stat-val[data-val]` 等。详情页 HTML 缓存到 `.tmp/spirit_details/`，重跑复用、便于排查。
>
> 图鉴页同样用 `requests` 下载（`sync_spirits.download_gallery`，内置指数退避重试）。

## 完整工作流程

所有命令在**项目根目录**执行（脚本使用相对路径 `.tmp/`、`data/`）。本机为 Windows PowerShell，**不要**用 `cd /d`。

### Step 1: 下载并解析图鉴页 → 基础信息 JSON

`extract_spirits.py` 解析本地图鉴 HTML；若未提供 HTML，可先用命令下载（带重试）：

```cmd
python -c "import requests,pathlib; pathlib.Path('.tmp').mkdir(exist_ok=True); url='https://wiki.biligame.com/nrc/%E7%B2%BE%E7%81%B5%E5%9B%BE%E9%89%B4'; h={'User-Agent':'Mozilla/5.0'};
import time
for i in range(1,6):
    r=requests.get(url,headers=h,timeout=60); r.encoding='utf-8'
    if r.status_code==200: pathlib.Path('.tmp/spirit_gallery.html').write_text(r.text,encoding='utf-8'); print('saved',len(r.text)); break
    print('try',i,r.status_code); time.sleep(3*i)"
```

解析（按编号范围过滤）：

```cmd
python ".codebuddy/skills/sync-spirits/scripts/extract_spirits.py" .tmp/spirit_gallery.html .tmp/spirits.json --start-no 1 --end-no 9999
```

- `--start-no N` / `--end-no M`：编号范围；`--all`：忽略过滤输出全部
- 输出 JSON：每个精灵含 `no, n, a1, a2, st, img, detail_url, stage, form, season`

### Step 2: 抓取详情页 + 组装 + 合并（推荐一条龙）

`sync_spirits.py` 会自动：读取/下载图鉴 → 解析列表 → 用 `requests` 逐个抓取每个详情页（带缓存）→ 组装完整对象 → 写 `.tmp/spirits_full.json`（只含成功结果）。加 `--merge` 才写入 `data/spirits.js`：新精灵先在内存累积（按 `no+名称` 去重只追加），**一轮结束统一落盘**——有新增才写，写前备份原文件到 `.tmp/spirits.js.bak`：

```cmd
python ".codebuddy/skills/sync-spirits/scripts/sync_spirits.py" --gallery .tmp/spirit_gallery.html --out .tmp/spirits_full.json --merge
```

- 不加 `--merge`：只生成 `.tmp/spirits_full.json`，**不改动项目数据**（安全预览）
- `--start-no N` / `--end-no M` / `--all`：限定范围，避免一次性抓全量
- `--limit N`：过滤后再截断，只抓前 N 个（测试用）
- `--gallery`：指定已下载的图鉴 HTML（缺省自动下载）

### 错误处理与重跑

- 错误分两类：`ERR`（抓取失败，多为 WAF `567` 拦截）与 `incomplete stats`（抓到了但六项资质不全是 `int`）。单只失败**不中断整轮**，失败精灵不写入 `data/spirits.js`
- **轮末自愈**：按错误清单自动删除失败精灵的详情页缓存（`fetch_spirit_detail.delete_cache`）——`incomplete` 页会留下坏缓存，删掉后下次重跑重新抓取；`567` 本就无缓存，删除为空操作
- **重跑收敛**：WAF `567` 是间歇性拦截，有 ERR 直接重跑同一命令即可（已缓存的秒过、只补抓失败的）；实测全量 622 只经 2-4 轮全部成功
- 错误只打印到控制台（前 10 条）不落盘；需要完整日志可在 PowerShell 加 `| Tee-Object -FilePath .tmp/spirit_sync_log.txt`

### （可选）单独解析某个详情页

`fetch_spirit_detail.py` 可单独解析一份详情页 HTML，便于排查单个精灵：

```cmd
python ".codebuddy/skills/sync-spirits/scripts/fetch_spirit_detail.py" .tmp/spirit_detail.html
```

### Step 3: 验证

用 node 校验 `data/spirits.js` 语法与字段完整性（`const` 不挂到 context，需用 `vm.runInContext(code + ";SPIRITS;", sandbox)` 取回）：

```cmd
node -e "const vm=require('vm'),fs=require('fs');const sb={};vm.createContext(sb);const S=vm.runInContext(fs.readFileSync('data/spirits.js','utf8')+'\n;SPIRITS;',sb);console.log('count',S.length);console.log('valid',S.every(s=>s.no&&s.n&&typeof s.hp==='number'&&typeof s.sp==='number'&&s.a1));const seen=new Set();let dup=0;for(const s of S){const k=s.no+s.n;if(seen.has(k))dup++;seen.add(k);}console.log('dups',dup);"
```

- 检查：数量、字段完整（六项资质均为数字）、`no+n` 无重复、关键精灵（迪莫等）存在
- 打开 `index.html` 手动验证：精灵搜索/选择正常、头像加载（失败有 emoji 兜底）

## 注意事项

- **只追加新精灵**：`--merge` 按 `no + 名称` 去重，已存在的精灵不会被覆盖或重复添加；若需更新某精灵数值，需手动编辑 `data/spirits.js`
- **详情页数值取 `data-val`**：`.roco-stat-val` 文本固定为 `0`，必须用其 `data-val` 属性，否则六项资质全变成 0
- **属性去「系」字**：图鉴 `.npc-type` 的 `title` 是「光系」之类，写入 `a1/a2` 时要去掉「系」
- 所有用户可见文案为简体中文；文件 UTF-8 编码。终端乱码是显示端解码问题，不要"修复"编码（避免把中文塞进 `python -c` 内联脚本；必要中文放脚本文件内，脚本已用 `sys.stdout.reconfigure(encoding="utf-8")`）
- `data/spirits.js` 被 `index.html` 在 body 末尾按序加载，不能移回 `<head>` 或加 `defer`
- 详情页 HTML 缓存于 `.tmp/spirit_details/`，重跑复用；排查异常精灵可直接读取对应缓存文件
