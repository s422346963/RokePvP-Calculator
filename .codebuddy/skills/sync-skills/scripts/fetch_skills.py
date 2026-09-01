# -*- coding: utf-8 -*-
"""
从技能图鉴页面 HTML 提取技能数据，输出 JSON。

Usage:
    python fetch_skills.py [input_html] [output_json]
    默认 input_html=.tmp/skill_gallery.html  output_json=.tmp/skills.json
"""
import sys
import json
import pathlib
import requests
from bs4 import BeautifulSoup

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

GALLERY_URL = "https://wiki.biligame.com/rocom/%E6%8A%80%E8%83%BD%E5%9B%BE%E9%89%B4"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
}


def download_html(url, out_path):
    """下载页面 HTML。"""
    print(f"Downloading {url} ...")
    r = requests.get(url, headers=HEADERS, timeout=60)
    r.encoding = "utf-8"
    print(f"  status={r.status_code} bytes={len(r.text)}")
    pathlib.Path(out_path).write_text(r.text, encoding="utf-8")
    return r.text


def parse_skills(html):
    """解析全部技能卡片。"""
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select("div.dex-skill-card")
    print(f"Found {len(cards)} skill cards")
    results = []
    for card in cards:
        name_el = card.select_one(".dex-card-name a")
        name = name_el.get_text(strip=True) if name_el else ""
        url = name_el.get("href", "") if name_el else ""
        if url and not url.startswith("http"):
            url = "https://wiki.biligame.com" + url

        # 属性：.dex-type 内的 span
        attr_el = card.select_one(".dex-type span")
        attr = attr_el.get_text(strip=True) if attr_el else ""

        # 类型：.dex-skill-kind（物攻/魔攻/防御/状态）
        kind_el = card.select_one(".dex-skill-kind")
        kind = kind_el.get_text(strip=True) if kind_el else ""

        # 描述
        desc_el = card.select_one(".dex-skill-desc")
        desc = desc_el.get_text(strip=True) if desc_el else ""

        # 威力 / 能耗：.dex-skill-meta 里两个 <span><strong>数字</strong><em>单位</em></span>
        meta_strongs = card.select(".dex-skill-meta span strong")
        power, cost = None, None
        if len(meta_strongs) >= 1:
            power = meta_strongs[0].get_text(strip=True) or None
        if len(meta_strongs) >= 2:
            cost = meta_strongs[1].get_text(strip=True) or None
        for v in ("—", "-", "－"):
            if power == v:
                power = None
            if cost == v:
                cost = None
        if power is not None:
            try:
                power = int(power)
            except ValueError:
                pass
        if cost is not None:
            try:
                cost = int(cost)
            except ValueError:
                pass

        # 图标
        img_el = card.select_one(".dex-skill-icon img")
        img = img_el.get("src", "") if img_el else ""

        # 只保留攻击类技能（物攻/魔攻），排除状态/防御
        if kind in ("状态", "防御"):
            continue

        results.append({
            "n": name,
            "a": attr,
            "k": kind,
            "p": power,
            "c": cost,
            "desc": desc,
            "img": img,
        })
    return results


def main():
    in_path = sys.argv[1] if len(sys.argv) > 1 else ".tmp/skill_gallery.html"
    out_path = sys.argv[2] if len(sys.argv) > 2 else ".tmp/skills.json"

    if pathlib.Path(in_path).exists():
        html = pathlib.Path(in_path).read_text(encoding="utf-8")
    else:
        html = download_html(GALLERY_URL, in_path)

    skills = parse_skills(html)

    pathlib.Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(skills, f, ensure_ascii=False, indent=2)

    print(f"Output written to: {out_path} ({len(skills)} skills)")

    # 摘要
    kinds = {}
    for s in skills:
        kinds[s["k"]] = kinds.get(s["k"], 0) + 1
    print("Kinds:", json.dumps(kinds, ensure_ascii=False))
    for s in skills[:3]:
        print(" ", json.dumps(s, ensure_ascii=False))


if __name__ == "__main__":
    main()
