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

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SRC = sys.argv[1] if len(sys.argv) > 1 else ".tmp/skills.json"
DST = sys.argv[2] if len(sys.argv) > 2 else "data/skills.js"


def js_str(v):
    """把字符串转为带双引号的 JS 字面量（复用 JSON 转义，兼容 JS）。"""
    return json.dumps(v, ensure_ascii=False)


def main():
    skills = json.load(open(SRC, encoding="utf-8"))
    print(f"Loaded {len(skills)} skills from {SRC}")

    lines = ["const SKILLS = ["]
    for i, s in enumerate(skills):
        item = (
            f"  {{ n: {js_str(s['n'])}, a: {js_str(s['a'])}, p: {s['p']}, "
            f"k: {js_str(s['k'])}, c: {s['c']}, desc: {js_str(s['desc'])} }}"
        )
        if i < len(skills) - 1:
            item += ","
        lines.append(item)
    lines.append("];")
    lines.append("")

    content = "\n".join(lines)
    pathlib.Path(DST).write_text(content, encoding="utf-8")
    print(f"Written {len(skills)} skills to {DST} ({len(content)} bytes)")


if __name__ == "__main__":
    main()
