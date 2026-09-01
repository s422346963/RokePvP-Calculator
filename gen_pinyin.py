# -*- coding: utf-8 -*-
"""
从 data/skills.js 的技能名（n 字段）与 data/spirits.js 的精灵名（n 字段）中
收集全部汉字，逐字去重后生成 data/pinyin.js（PINYIN_MAP：汉字 -> 全拼）。

用法：
    python gen_pinyin.py

前置依赖（需先安装）：
    pip install pypinyin

安全措施：
    - 运行前自动将 data/pinyin.js 备份为 pinyin.js.<时间戳>.bak
    - 不解析/执行任何 JS，仅用正则提取 n 字段，避免 eval 风险
"""
import io
import os
import re
import shutil
import sys
import time

try:
    from pypinyin import lazy_pinyin
except ImportError:
    sys.stderr.write("缺少依赖 pypinyin，请先运行: pip install pypinyin\n")
    sys.exit(1)

# 保证终端输出 UTF-8（Windows 控制台默认 GBK 时避免 UnicodeEncodeError）
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except AttributeError:
    pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
PINYIN_FILE = os.path.join(DATA_DIR, "pinyin.js")
SKILLS_FILE = os.path.join(DATA_DIR, "skills.js")
SPIRITS_FILE = os.path.join(DATA_DIR, "spirits.js")

# skills.js 中裸键写法：{ n: "抓挠", ... }
SKILLS_NAME_RE = re.compile(r"\bn\s*:\s*\"([^\"]+)\"")
# spirits.js 中带引号键写法："n": "迪莫"（不会误匹配 "no"）
SPIRITS_NAME_RE = re.compile(r"\"n\"\s*:\s*\"([^\"]+)\"")
# 仅保留 CJK 统一表意文字（基本区），跳过数字/字母/符号
HAN_RE = re.compile(r"^[\u4e00-\u9fff]$")


def extract_names(path, pattern):
    """用正则从 JS 数据文件中提取全部名称字段。"""
    with io.open(path, "r", encoding="utf-8") as f:
        text = f.read()
    return [m.group(1) for m in pattern.finditer(text)]


def main():
    for p in (SKILLS_FILE, SPIRITS_FILE, PINYIN_FILE):
        if not os.path.exists(p):
            sys.stderr.write("未找到文件: %s\n" % p)
            return 1

    # 1) 备份现有 pinyin.js
    backup = PINYIN_FILE + "." + time.strftime("%Y%m%d-%H%M%S") + ".bak"
    shutil.copy2(PINYIN_FILE, backup)
    print("已备份: %s" % backup)

    # 2) 收集名称并拆字去重（保持首次出现顺序）
    names = []
    names += extract_names(SKILLS_FILE, SKILLS_NAME_RE)
    names += extract_names(SPIRITS_FILE, SPIRITS_NAME_RE)
    chars, seen = [], set()
    for name in names:
        for ch in name:
            if HAN_RE.match(ch) and ch not in seen:
                seen.add(ch)
                chars.append(ch)
    print("技能/精灵名称: %d 条, 去重后汉字: %d 个" % (len(names), len(chars)))
    if not chars:
        sys.stderr.write("未提取到任何汉字，已终止，原文件保持不变。\n")
        return 1

    # 3) 汉字 -> 全拼
    pinyins = lazy_pinyin(chars)
    entries = ['"%s":"%s"' % (ch, py) for ch, py in zip(chars, pinyins)]

    # 4) 保留原文件对象外的历史注释行（如 //const SPIRITS_ORDER = ...;）
    with io.open(PINYIN_FILE, "r", encoding="utf-8") as f:
        old_lines = f.read().splitlines()
    tail = [ln for ln in old_lines if ln.startswith("//const ")]

    # 5) 拼装输出：每行 10 个条目
    per_line = 10
    out = ["const PINYIN_MAP={"]
    for i in range(0, len(entries), per_line):
        out.append("  " + ",".join(entries[i:i + per_line]) + ",")
    out[-1] = out[-1].rstrip(",")  # 去掉尾逗号
    out.append("};")
    out.extend(tail)
    content = "\n".join(out) + "\n"

    with io.open(PINYIN_FILE, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    print("已写入 %s (%d 个汉字)" % (PINYIN_FILE, len(chars)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
