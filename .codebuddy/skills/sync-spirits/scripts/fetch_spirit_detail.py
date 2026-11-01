# -*- coding: utf-8 -*-
"""
解析单个精灵详情页（nrc 域），提取资质、特性、属性。

详情页结构有两套，parse_detail 都支持：
  新结构（nrc 站 2026-11 起）：
    - 资质：`.sd-p-stat` 列表，`.sd-p-stat-rune[data-rune=HP/ATK/MATK/DEF/MDEF/SPD]`
            + `.sd-p-stat-number`（数值文本）
    - 特性：`.sd-p-trait-name`（名称）、`.sd-p-trait-description`（描述）
    - 属性：`.sd-p-header-types .sd-type`（文本「幽系」，去「系」字）
  旧结构（rocom 遗留，仍兼容）：
    - 资质：`.roco-stat`，`.roco-stat-val[data-val=真实数值]`（文本是占位 0）
    - 特性：`.roco-feature-name` / `.roco-feature-desc`
    - 属性：`.roco-type`

抓取统一用 `requests`（快，~0.x s/页）；wiki 偶发的 567 由指数退避重试吸收，
个别页面持续被拦截时稍后重跑即可（已缓存的秒过，只补抓失败的）。

Usage:
    python fetch_spirit_detail.py <detail_html_file> [output_json]
    # 或作为库被 sync_spirits.py 调用： parse_detail(html) / fetch_detail(url, cache_dir, ...)
"""
import sys
import json
import re
import time
import pathlib
import argparse
from urllib.parse import quote, unquote
import requests
from bs4 import BeautifulSoup

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# Referer 指向图鉴页：nrc 域对「无来源的直接详情页请求」更容易返回 567（WAF 拦截）
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Referer": "https://wiki.biligame.com/nrc/%E7%B2%BE%E7%81%B5%E5%9B%BE%E9%89%B4",
}

# 详情页资质字段映射（新结构 sd-p-* 用「物攻/魔攻」，旧结构 roco-* 用「攻击」）
STAT_KEYS = {
    "生命": "hp",
    "攻击": "pa",
    "物攻": "pa",
    "魔攻": "ma",
    "物防": "pd",
    "魔防": "md",
    "速度": "sp",
}

# 新结构更稳的取法：资质行图标上的 data-rune
RUNE_KEYS = {
    "HP": "hp",
    "ATK": "pa",
    "MATK": "ma",
    "DEF": "pd",
    "MDEF": "md",
    "SPD": "sp",
}


def _parse_stats(soup):
    """资质：新结构 .sd-p-stat（数值在 .sd-p-stat-number 文本里），旧结构 .roco-stat。"""
    out = {}
    for stat in soup.select(".sd-p-stat"):
        rune = stat.select_one(".sd-p-stat-rune")
        label = stat.select_one(".sd-p-stat-label")
        num = stat.select_one(".sd-p-stat-number")
        key = RUNE_KEYS.get((rune.get("data-rune") or "").strip()) if rune else None
        if not key and label:
            key = STAT_KEYS.get(label.get_text(strip=True))
        if not key or not num:
            continue
        try:
            out[key] = int(num.get_text(strip=True))
        except (ValueError, TypeError):
            pass
    if out:
        return out

    for stat in soup.select(".roco-stat"):
        name_el = stat.select_one(".roco-stat-name")
        val_el = stat.select_one(".roco-stat-val")
        if not name_el or not val_el:
            continue
        key = STAT_KEYS.get(name_el.get_text(strip=True))
        if not key:
            continue
        dv = val_el.get("data-val")
        try:
            out[key] = int(dv) if dv is not None else None
        except (ValueError, TypeError):
            out[key] = None
    return out


def parse_detail(html: str):
    """从详情页 HTML 解析出 stats / trait / attrs。

    兼容两套结构：
      - 新（2026-11 起，nrc 详情页）：`.sd-p-stat` / `.sd-p-trait-name` /
        `.sd-p-trait-description` / `.sd-p-header-types .sd-type`
      - 旧（rocom 遗留）：`.roco-stat`(data-val) / `.roco-feature-*` / `.roco-type`
    """
    soup = BeautifulSoup(html, "html.parser")
    out = {k: None for k in STAT_KEYS.values()}
    out["tr"] = ""
    out["tr_desc"] = ""
    out["a1"] = ""
    out["a2"] = ""

    out.update(_parse_stats(soup))

    feat_name = soup.select_one(".sd-p-trait-name") or soup.select_one(".roco-feature-name")
    feat_desc = soup.select_one(".sd-p-trait-description") or soup.select_one(".roco-feature-desc")
    if feat_name:
        out["tr"] = feat_name.get_text(strip=True)
    if feat_desc:
        out["tr_desc"] = feat_desc.get_text(strip=True)

    type_els = soup.select(".sd-p-header-types .sd-type") or soup.select(".roco-type")
    types = [t.get_text(strip=True) for t in type_els]
    types = [t.replace("系", "").strip() for t in types if t]
    if len(types) > 0:
        out["a1"] = types[0]
    if len(types) > 1:
        out["a2"] = types[1]

    return out


_SESSION = requests.Session()
_SESSION.headers.update(HEADERS)


def _fetch_via_requests(url: str, retries=3):
    """用 requests 抓取详情页 HTML；非 200 或缺资质节点则按指数退避重试，耗尽后抛异常。

    复用同一个 Session：详情页偶发 567（WAF），带 Referer + 复用连接后成功率明显更高。
    """
    last = None
    for attempt in range(1, retries + 1):
        try:
            r = _SESSION.get(url, timeout=30)
            r.encoding = "utf-8"
            if r.status_code == 200 and ("sd-p-stat" in r.text or "roco-stat-val" in r.text):
                return r.text
            last = r.status_code
        except Exception as e:
            last = e
        if attempt < retries:
            time.sleep(2 ** attempt)
    raise RuntimeError(f"requests 未能取得有效详情页: {last}")


def _sanitize_filename(key: str) -> str:
    """清理文件名中的 Windows 非法字符（\\ / : * ? " < > |）。"""
    return re.sub(r'[\\/:*?"<>|]', "_", key).strip()


def _cache_candidates(url: str, cache_dir: pathlib.Path):
    """缓存文件名候选列表（首个为写入用主名）。

    图鉴 href 本身已是 percent-encoded（%E9...），若直接 quote 会二次编码
    （%E9 -> %25E9），长名称精灵的缓存文件名可超 250 字符，加上目录后在
    Windows 上突破 260 字符路径上限，写缓存报 FileNotFoundError。
    因此主名先 unquote 解码、再以 safe=":/" 编码一次（每汉字仅 9 字符）。
    旧版双编码文件名保留为读取候选，已有缓存仍可复用。
    """
    primary = quote(unquote(url), safe=":/") + ".html"
    legacy = quote(url, safe="") + ".html"
    return [cache_dir / primary, cache_dir / legacy]


def delete_cache(key: str, cache_dir=".tmp/spirit_details"):
    """删除指定 key（编号+名称）的详情页缓存文件，返回是否删除了文件。

    用于坏缓存自愈：页面抓取成功但内容不完整（incomplete stats）时缓存已被
    写入，重跑会一直命中坏缓存；轮末按错误清单删除后，下次重跑重新抓取。
    抓取失败（如 567）本就不会写缓存，此处按文件是否存在静默处理。
    """
    p = pathlib.Path(cache_dir) / (_sanitize_filename(key) + ".html")
    if p.exists():
        p.unlink()
        return True
    return False


def fetch_detail(url: str, cache_dir=".tmp/spirit_details", retries=3, key=None):
    """抓取并解析详情页，返回 parse_detail 的 dict。

    - 命中缓存直接返回；key 传「编号+名称」时缓存命名为 `<no><n>.html`（可读），
      未传 key 时回退到 URL 编码名（先 unquote 再 quote，避免二次编码超长）；
    - 用 requests 抓取（指数退避重试），重试耗尽仍失败则抛异常。
    """
    cache_dir = pathlib.Path(cache_dir)
    if key:
        caches = [cache_dir / (_sanitize_filename(key) + ".html")]
    else:
        caches = _cache_candidates(url, cache_dir)
    for c in caches:
        if c.exists():
            return parse_detail(c.read_text(encoding="utf-8"))

    html = _fetch_via_requests(url, retries)

    cache_dir.mkdir(parents=True, exist_ok=True)
    caches[0].write_text(html, encoding="utf-8")
    return parse_detail(html)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("html_file", help="Detail HTML file path")
    parser.add_argument("output", nargs="?", default=None, help="Output JSON (optional)")
    args = parser.parse_args()
    html = open(args.html_file, "r", encoding="utf-8").read()
    data = parse_detail(html)
    print(json.dumps(data, ensure_ascii=False, indent=2))
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
