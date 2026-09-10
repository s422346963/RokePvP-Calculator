# -*- coding: utf-8 -*-
"""
从 nrc 精灵图鉴页解析精灵基础信息，输出 JSON。

图鉴页（https://wiki.biligame.com/nrc/精灵图鉴）每个精灵是一张
`div.npc-card` 卡片，离线解析即可拿到：编号、名称、属性、图片、详情页链接等。
详情页（如 https://wiki.biligame.com/nrc/迪莫）的资质/特性由 fetch_spirit_detail.py 解析。

Usage:
    python extract_spirits.py <input_html> <output_json> [--start-no N] [--end-no M] [--all]
"""
import sys
import json
import argparse
import re
from bs4 import BeautifulSoup

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BASE = "https://wiki.biligame.com"

# 形态/阶段值视为「无特殊形态」，出现时不写入 st
# （来自卡片 .npc-form 的显示文本；首领形态/本来的样子与基础形态资质相同，视为中性）
_NEUTRAL_FORMS = ("main", "主形态", "原始形态", "首领形态", "本来的样子", "")
_NEUTRAL_STAGES = ("一阶", "二阶", "三阶", "")


def _strip_type(t):
    """属性标签形如「光系」，去掉「系」字得到裸属性「光」。"""
    return t.replace("系", "").strip()


def parse_gallery(html: str):
    """解析全部 npc-card，返回基础信息 dict 列表。"""
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select("div.npc-card")
    results = []
    for card in cards:
        no = (card.get("data-number") or "").strip()
        if not no:
            # 兜底：从 aria-label "001 迪莫" 取
            al = card.get("aria-label", "")
            m = re.search(r"(\d+)", al)
            no = m.group(1) if m else ""
        no = no.zfill(3) if no.isdigit() else no

        name_el = card.select_one(".npc-name")
        name = name_el.get_text(strip=True) if name_el else ""

        # 属性：卡片类型标签（可能双属性），裸属性
        types = []
        for t in card.select(".npc-card-types .npc-type"):
            title = t.get("title", "") or t.get_text(strip=True)
            if title:
                types.append(_strip_type(title))
        a1 = types[0] if len(types) > 0 else (card.get("data-type") or "")
        a2 = types[1] if len(types) > 1 else ""

        # 图片：优先全身立绘，回退到头像
        art = card.select_one(".npc-art-normal img") or card.select_one(".npc-art-head img")
        img = art.get("src", "") if art else ""

        # 详情页链接
        a = card.select_one(".npc-card-target a")
        href = a.get("href", "") if a else ""
        if href and not href.startswith("http"):
            href = BASE + href
        detail_url = href

        # 名称：优先取详情链接 title —— wiki 官方完整名（含形态后缀，如
        # 「鸭吉吉（蓬松的样子）」）。同一编号下各形态卡片的 .npc-name 都是
        # 基础名（如「鸭吉吉」），只用它会因 (no, n) 撞车在合并时丢形态。
        link_title = (a.get("title", "").strip() if a else "")
        if link_title:
            name = link_title
        elif not name:
            # 兜底：从 aria-label "011 鸭吉吉（蓬松的样子）" 去掉编号前缀
            al = card.get("aria-label", "")
            name = al.split(" ", 1)[1] if " " in al else al

        stage_text = (card.select_one(".npc-stage").get_text(strip=True)
                      if card.select_one(".npc-stage") else "")
        # 形态：用卡片显示文本 .npc-form（如「蓬松的样子」），
        # 不用 data-form（内部多值代号如 "main|regional"，写入 st 会变脏数据）
        form_el = card.select_one(".npc-form")
        form = form_el.get_text(strip=True) if form_el else ""
        season = card.get("data-season", "")

        # st：仅在确有特殊形态/阶段时记录（当前数据普遍为空，保持一致）
        st_parts = []
        if form and form not in _NEUTRAL_FORMS:
            st_parts.append(form)
        if stage_text and stage_text not in _NEUTRAL_STAGES:
            st_parts.append(stage_text)
        st = "/".join(st_parts)

        results.append({
            "no": no,
            "n": name,
            "a1": a1,
            "a2": a2,
            "st": st,
            "img": img,
            "detail_url": detail_url,
            "stage": stage_text,
            "form": form,
            "season": season,
        })
    return results


def main():
    parser = argparse.ArgumentParser(description="Extract spirit cards from nrc gallery HTML")
    parser.add_argument("input", help="Input gallery HTML file path")
    parser.add_argument("output", help="Output JSON file path")
    parser.add_argument("--start-no", type=int, default=1,
                        help="Starting spirit number (inclusive)")
    parser.add_argument("--end-no", type=int, default=9999,
                        help="Ending spirit number (inclusive)")
    parser.add_argument("--all", action="store_true",
                        help="Output all spirits (ignore filter)")
    args = parser.parse_args()

    try:
        html = open(args.input, "r", encoding="utf-8").read()
    except FileNotFoundError:
        print(f"Error: Input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    spirits = parse_gallery(html)
    print(f"Parsed {len(spirits)} spirits from HTML")

    if not args.all:
        filtered = []
        for s in spirits:
            try:
                if args.start_no <= int(s["no"]) <= args.end_no:
                    filtered.append(s)
            except ValueError:
                pass
        print(f"After filtering (no {args.start_no}-{args.end_no}): {len(filtered)} spirits")
        spirits = filtered

    spirits.sort(key=lambda s: int(s["no"]) if s["no"].isdigit() else 9999)

    import os
    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(spirits, f, ensure_ascii=False, indent=2)
    print(f"Output written to: {args.output}")

    for s in spirits[:5]:
        print(f"  NO.{s['no']:>3s} {s['n']:<8s} | {s['a1']}/{s['a2']} | st={s['st']}")
    if len(spirits) > 5:
        print(f"  ... and {len(spirits) - 5} more")


if __name__ == "__main__":
    main()
