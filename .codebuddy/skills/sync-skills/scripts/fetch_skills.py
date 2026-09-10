# -*- coding: utf-8 -*-
"""
从 nrc 技能图鉴同步技能数据（两步法）。

Step 1: 下载技能图鉴页 https://wiki.biligame.com/nrc/技能图鉴，
        解析出全部技能的名称与详情页链接（以及图鉴中的分类）。
Step 2: 逐个访问技能详情页（如 https://wiki.biligame.com/nrc/抓挠），
        解析 属性 / 类型 / 威力 / 耗能 / 描述 / 图标。

默认只保留攻击类技能（物攻 / 魔攻 / 双攻），过滤掉 状态 / 防御；
如需保留全部技能，将 KEEP_KINDS 设为 None 或修改过滤逻辑。

Usage:
    python fetch_skills.py [input_gallery_html] [output_json]
    默认 input_gallery_html=.tmp/skill_gallery.html  output_json=.tmp/skills.json
可选环境变量 / 参数：
    --limit N        只抓取前 N 个技能（用于测试，不便覆盖正式数据）
    --all            不过滤，保留全部技能（含状态/防御）
"""
import sys
import json
import time
import pathlib
import argparse
import requests
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BASE = "https://wiki.biligame.com"
GALLERY_URL = BASE + "/nrc/%E6%8A%80%E8%83%BD%E5%9B%BE%E9%89%B4"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
}
DETAIL_DIR = pathlib.Path(".tmp/skill_details")
# 默认只保留攻击类技能；None 表示保留全部
KEEP_KINDS = ("物攻", "魔攻", "双攻")
# 并发抓取详情页的线程数
WORKERS = 16


def to_int(val):
    """把威力/能耗文本转为 int 或 None（"—"、"无"、空 等视为 None）。"""
    if val is None:
        return None
    val = val.strip()
    for dash in ("—", "-", "－", "无", ""):
        if val == dash:
            return None
    try:
        return int(val)
    except ValueError:
        return None


def get_with_retry(url, timeout=60, retries=3):
    """带退避重试的 GET。wiki 偶发返回 567（限流），重试通常可恢复。"""
    last = None
    for attempt in range(1, retries + 1):
        try:
            r = requests.get(url, headers=HEADERS, timeout=timeout)
            r.encoding = "utf-8"
            if r.status_code == 200:
                return r
            last = r
            print(f"  [retry {attempt}/{retries}] {url} -> {r.status_code}")
        except Exception as e:
            last = e
            print(f"  [retry {attempt}/{retries}] {url} -> {e}")
        if attempt < retries:
            time.sleep(2 ** attempt)  # 2s, 4s, 8s...
    return last


def download(url, out_path=None, timeout=60):
    """下载页面 HTML，可选写入文件。"""
    print(f"Downloading {url} ...")
    r = get_with_retry(url, timeout)
    if isinstance(r, requests.Response) and r.status_code == 200:
        print(f"  status={r.status_code} bytes={len(r.text)}")
        if out_path:
            pathlib.Path(out_path).parent.mkdir(parents=True, exist_ok=True)
            pathlib.Path(out_path).write_text(r.text, encoding="utf-8")
        return r.text
    raise RuntimeError(f"Failed to download {url}: {getattr(r, 'status_code', r)}")


def parse_gallery(html):
    """从图鉴页解析出全部技能（名称、详情链接、图鉴分类）。"""
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select("div.nrc-skill-catalog-card")
    print(f"Found {len(cards)} skill cards in gallery")
    items = []
    for card in cards:
        name_el = card.select_one(".nrc-skill-catalog-card-name")
        name = name_el.get_text(strip=True) if name_el else ""
        if not name:
            continue
        cat = card.get("data-skill-catalog-category", "")
        attr = card.get("data-skill-catalog-type", "")
        a = card.select_one("a")
        href = a.get("href", "") if a else ""
        if href and not href.startswith("http"):
            href = BASE + href
        items.append({
            "name": name,
            "url": href,
            "gallery_cat": cat,
            "gallery_attr": attr,
        })
    return items


def _cache_path(name):
    # 用 URL 编码后的名称做文件名，避免中文路径问题
    from urllib.parse import quote
    return DETAIL_DIR / (quote(name, safe="") + ".html")


def fetch_detail(item):
    """抓取并解析单个技能详情页，返回技能 dict；失败返回带 error 的 dict。"""
    name = item["name"]
    cache = _cache_path(name)
    try:
        if cache.exists():
            html = cache.read_text(encoding="utf-8")
        else:
            r = get_with_retry(item["url"], 60)
            if not (isinstance(r, requests.Response) and r.status_code == 200):
                return {"name": name, "url": item["url"],
                        "error": f"status {getattr(r, 'status_code', r)}"}
            html = r.text
            DETAIL_DIR.mkdir(parents=True, exist_ok=True)
            cache.write_text(html, encoding="utf-8")
    except Exception as e:
        return {"name": name, "url": item["url"], "error": str(e)}

    soup = BeautifulSoup(html, "html.parser")
    root = soup.select_one("div.nrc-skill-detail")
    if root is None:
        return {"name": name, "url": item["url"], "error": "no nrc-skill-detail"}

    attr = root.get("data-skill-type", "") or item.get("gallery_attr", "")

    name_el = soup.select_one(".nrc-skill-name")
    name = name_el.get_text(strip=True) if name_el else name

    # 类型（物攻/魔攻/防御/状态/双攻）：取第一个非空的分类标签
    kind = ""
    for chip in soup.select(".nrc-skill-category-chip"):
        t = chip.get_text(strip=True)
        if t:
            kind = t
            break

    # 威力 / 能耗：按标签取对应数值
    stats = {}
    for s in soup.select(".nrc-skill-stat"):
        lbl = s.select_one(".nrc-skill-stat-label")
        val = s.select_one(".nrc-skill-stat-value")
        if lbl and val:
            stats[lbl.get_text(strip=True)] = val.get_text(strip=True)
    power = to_int(stats.get("威力"))
    cost = to_int(stats.get("耗能"))

    desc_el = soup.select_one(".nrc-skill-effect-text")
    desc = desc_el.get_text(strip=True) if desc_el else ""

    img_el = soup.select_one(".nrc-skill-icon img")
    img = img_el.get("src", "") if img_el else ""

    return {
        "n": name,
        "a": attr,
        "k": kind,
        "p": power,
        "c": cost,
        "desc": desc,
        "img": img,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input", nargs="?", default=".tmp/skill_gallery.html")
    parser.add_argument("output", nargs="?", default=".tmp/skills.json")
    parser.add_argument("--limit", type=int, default=0, help="只抓取前 N 个（测试用）")
    parser.add_argument("--all", action="store_true", help="不过滤，保留全部技能")
    args = parser.parse_args()

    keep = None if args.all else KEEP_KINDS

    if pathlib.Path(args.input).exists():
        html = pathlib.Path(args.input).read_text(encoding="utf-8")
    else:
        html = download(GALLERY_URL, args.input)

    items = parse_gallery(html)

    # 默认只抓取攻击类（图鉴分类已足够可靠，避免对状态/防御技能发起无用请求）
    if keep:
        items = [it for it in items if it["gallery_cat"] in keep]
    print(f"To fetch details for {len(items)} skills")

    if args.limit:
        items = items[:args.limit]

    results = []
    errors = []
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(fetch_detail, it): it for it in items}
        done = 0
        for fut in as_completed(futs):
            done += 1
            res = fut.result()
            if "error" in res:
                errors.append(res)
                if done % 50 == 0 or done == len(items):
                    print(f"  progress {done}/{len(items)} (errors so far {len(errors)})")
            else:
                results.append(res)
                if done % 50 == 0 or done == len(items):
                    print(f"  progress {done}/{len(items)}")

    # 若带 --all，再按详情页解析出的类型过滤（否则已在图鉴层过滤）
    if keep:
        results = [r for r in results if r["k"] in keep]

    pathlib.Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"Output written to: {args.output} ({len(results)} skills, {len(errors)} errors)")
    if errors:
        print("Errors (first 10):")
        for e in errors[:10]:
            print("  ", e["name"], e.get("error"))

    # 摘要
    kinds = {}
    for s in results:
        kinds[s["k"]] = kinds.get(s["k"], 0) + 1
    print("Kinds:", json.dumps(kinds, ensure_ascii=False))
    for s in results[:3]:
        print(" ", json.dumps(s, ensure_ascii=False))


if __name__ == "__main__":
    main()
