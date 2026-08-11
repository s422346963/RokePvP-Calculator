---
name: sync-spirits
description: 从 wiki 精灵图鉴页面批量同步精灵数据。从图鉴列表页获取精灵基本信息，再逐个抓取详细资质数据，最后写入 data/spirits.js。
---

# Sync Spirits

从 `https://wiki.biligame.com/rocom/%E7%B2%BE%E7%81%B5%E5%9B%BE%E9%89%B4` 批量同步精灵数据到 `data/spirits.js`。

## 触发方式

- "同步N号开始的精灵数据"
- "从N号开始同步精灵"
- "同步N-M号的精灵数据"
- "同步N到M号的精灵"

## 完整工作流程

### Step 1: 下载图鉴页面 HTML

使用 `execute_command` 下载页面 HTML 到临时目录：

```cmd
if not exist "%TEMP%\spirit_sync" mkdir "%TEMP%\spirit_sync"
curl -sL -o "%TEMP%\spirit_sync\gallery.html" -H "User-Agent: Mozilla/5.0" "https://wiki.biligame.com/rocom/%E7%B2%BE%E7%81%B5%E5%9B%BE%E9%89%B4"
```

**注意**：页面约 1.8MB，需等待下载完成。

### Step 2: 运行 Python 解析脚本提取精灵列表

使用 `execute_command` 运行 `scripts/extract_spirits.py` 解析 HTML，按编号范围过滤：

```bash
python "<skill_base>/scripts/extract_spirits.py" \
  "%TEMP%\spirit_sync\gallery.html" \
  "%TEMP%\spirit_sync\spirits.json" \
  --start-no <N>
```

- `--start-no N`：从 N 号开始
- `--end-no M`（可选）：到 M 号结束
- 输出 JSON 文件，包含每个精灵的：`no`, `n`, `stage`, `a1`, `a2`, `form1`, `form2`, `img`, `detail_url`, `st` 等字段，其中的no,n,img,a1,a2是后续使用到的数据

脚本会打印摘要，例如：

```
Parsed 594 spirits from HTML
After filtering (no 440-9999): 155 spirits
  NO.440 睡铃雪影娃娃    | 冰/草 | st=一阶
  ...
```

### Step 3: 逐个获取精灵详细数据

对于 Step 2 输出的每个精灵：

1. **检查是否已存在**：读取 `data/spirits.js`，用 `no` + `n` 组合判断精灵是否已存在。已存在则跳过。

2. **获取详细数据**：使用 `web_fetch` 工具获取精灵详情页的原始 HTML：
   ```
   web_fetch:
     url: https://wiki.biligame.com/rocom/<精灵URL编码名>
     fetchInfo: 从 class="sprite-info-attrlist" 元素中提取精灵资质数据（生命/物攻/魔攻/物防/魔防/速度），从 class="sprite-trait-desc" 元素中提取精灵特性描述
   ```

3. **解析详细数据**（从页面 HTML 中提取）：
   - **资质数值**：`hp`（生命）、`pa`（物攻）、`ma`（魔攻）、`pd`（物防）、`md`（魔防）、`sp`（速度）
   - **特性**：`tr`（特性名称）
   - **特性描述**：`tr_desc`（特性描述）
   - **属性**：`a1`（主属性）、`a2`（副属性），从详情的属性标签提取
   - **图片**：用列表页的 `img`

4. **字段映射**，构建插入 `spirits.js` 的数据对象：
   ```
   {"no": "440", "n": "睡铃雪影娃娃", "hp": 116, "pa": 42, "ma": 104, "pd": 85, "md": 116, "sp": 100, "a1": "冰", "a2": "草", "tr": "安眠", "st": "", "img": "...", "tr_desc": "王国入夜后，进入战斗时获得全技能能耗+2，回合结束时自己回复5%生命和1能量。"}
   ```
   - `no`：3位数字字符串，不足补0（如 "001", "440"）
   - `n`：精灵名称
   - `a1`/`a2`：从详情页属性标签提取（比列表页更准确）
   - `st`：为空字符串 `""`，除非有特殊说明
   - `tr`：特性
   - `tr_desc`：特性描述

### Step 4: 写入 spirits.js

将新精灵数据追加到 `data/spirits.js` 的 `SPIRITS` 数组中。

**事项**：
- 在数组最后一个元素 `}` 之后、`]` 之前插入
- 每个对象后加逗号
- 使用 4 空格缩进
- 用 `replace_in_file` 工具精确替换
- 最后一行 `]` 不变

**插入模板**（追加在 `]` 之前）：

```javascript
    {
        "no": "441",
        "n": "宝藏小狐",
        "hp": 108,
        "pa": 50,
        "ma": 50,
        "pd": 112,
        "md": 112,
        "sp": 82,
        "a1": "普通",
        "a2": "",
        "tr": "属性反击",
        "st": "",
        "img": "https://patchwiki.biligame.com/images/rocom/thumb/x/xx/xxxx.png/180px-JL_xxx.png",
        "tr_desc": "xxxxxxxx"
    },
```

### Step 5: 报告同步结果

完成所有精灵同步后，汇总报告：

```
同步完成！
- 新增精灵：N 个
- 已存在跳过：M 个  
- 总计处理：T 个
```

### 错误处理

- 下载页面失败：重试一次，仍失败则报错并停止
- 单个精灵详情页获取失败：跳过该精灵，继续处理下一个，最后报告跳过的精灵
- Python 脚本执行失败：检查 Python 环境和 beautifulsoup4 依赖
