---
name: "fetch-spirit-from-url"
description: "从给定的URL链接中抓取精灵数据。从 class 为 sprite-info-attrlist 的元素中提取精灵资质数据（生命/物攻/魔攻/物防/魔防/速度），从 class 为 sprite-trait-desc 的元素中提取精灵特性"
---

# Fetch Spirit From URL

该技能用于从网页链接（如 patchwiki 精灵详情页）中自动抓取并新增一只精灵的数据。

## 使用方法

当用户提供某个精灵的 wiki 页面 URL，并要求"从该链接添加精灵 / 抓取精灵数据 / 从网页新增精灵"时调用此技能。

用户需要提供：
- **url**: 精灵详情页链接

## 说明内容

精灵信息说明如下：

- **n**: 精灵名称
- **hp**: 生命
- **pa**: 物攻
- **ma**: 魔攻
- **pd**: 物防
- **md**: 魔防
- **sp**: 速度
- **tr**: 特性名称
- **trait_desc**: 特性描述

## 工作流程

1. 使用web_fetch获取给定页面，若获取失败则提示用户失败，流程结束，无需再次尝试。

2. 在 HTML 中定位种族资质数据： `class="sprite-info-attrlist"` 与 特性数据：`class="sprite-trait-body"` 两个元素下的内容进行解析。

   种族资质按顺序为：生命、物攻、魔攻、物防、魔防、速度。

   特性名称(tr)在sprite-trait-name中匹配，特性描述(trait_desc)在sprite-trait-desc中匹配

3. 将解析得到的数据写入以下文件：
   - `data/spirits.js`：在 `SPIRITS` 数组中新增一条精灵记录，a1、a2、st、img 留空（除非页面中能明确获取）。

## 数据结构

`data/spirits.js` 数据结构（SPIRITS 数组）：

```
  [
      {
        "n": "遁地鼠（储水期的样子）",
        "hp": 112,
        "pa": 118,
        "ma": 23,
        "pd": 85,
        "md": 131,
        "sp": 100,
        "a1": "",
        "a2": "",
        "st": "最终形态",
        "tr": "警惕",
        "tr_desc":"最好的伙伴的特性描述"
        "img": ""
      }
  ]
```


## 示例

用户给出链接：`https://wiki.biligame.com/rocom/迪莫`

1. 大模型访问链接自行抓取到数据：
   ```json
   {
     "n": "迪莫",
     "hp": 120, "pa": 80, "ma": 80, "pd": 105, "md": 105, "sp": 92,
     "tr": "最好的伙伴",
     "trait_desc": "最好的伙伴的特性描述"
   }
   ```
2. 在 `data/spirits.js` 中新增：
   ```js
   {
     "n": "迪莫",
     "hp": 120, "pa": 80, "ma": 80, "pd": 105, "md": 105, "sp": 92,
     "a1": "", "a2": "", "st": "", "tr": "最好的伙伴", "img": "","tr_desc":"最好的伙伴的特性描述"
   }
   ```
