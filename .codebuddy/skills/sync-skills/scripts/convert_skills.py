# -*- coding: utf-8 -*-
"""
将 .tmp/skills.json（抓取的技能数据）转换为 data/skills.js 的 SKILLS 数组格式。

Usage:
    python convert_skills.py [src_json] [dst_js]
    默认 src=.tmp/skills.json  dst=data/skills.js
"""
import sys
import json
import pathlib
import re

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SRC = sys.argv[1] if len(sys.argv) > 1 else ".tmp/skills.json"
DST = sys.argv[2] if len(sys.argv) > 2 else "data/skills.js"

# 固定连击数：描述中「N连击」；条件性连击（如「连击数+1」「不含连击」）不匹配，按基础 1
HITS_RE = re.compile(r"(\d+)连击")


def js_str(v):
    """把字符串转为带双引号的 JS 字面量（复用 JSON 转义，兼容 JS）。"""
    return json.dumps(v, ensure_ascii=False)


def main():
    skills = json.load(open(SRC, encoding="utf-8"))
    print(f"Loaded {len(skills)} skills from {SRC}")

    lines = ["const SKILLS = ["]
    cb_counts = {}
    warnings = []
    for i, s in enumerate(skills):
        desc = s.get("desc") or ""
        m = HITS_RE.search(desc)
        cb = max(1, int(m.group(1))) if m else 1
        cb_counts[cb] = cb_counts.get(cb, 0) + 1
        if not m and "连击" in desc:
            warnings.append(f"{s['n']}：{desc}")
        item = (
            f"  {{ n: {js_str(s['n'])}, a: {js_str(s['a'])}, p: {s['p']}, "
            f"k: {js_str(s['k'])}, c: {s['c']}, cb: {cb}, desc: {js_str(s['desc'])} }}"
        )
        if i < len(skills) - 1:
            item += ","
        lines.append(item)
    lines.append("];")
    lines.append("")

    content = "\n".join(lines)
    pathlib.Path(DST).write_text(content, encoding="utf-8")
    dist = ", ".join(f"cb={k}: {v}" for k, v in sorted(cb_counts.items()))
    print(f"Written {len(skills)} skills to {DST} ({len(content)} bytes)")
    print(f"连击分布：{dist}")
    for w in warnings:
        print(f"警告：提及连击但无固定连击数，按 1 处理 -> {w}")


if __name__ == "__main__":
    main()
