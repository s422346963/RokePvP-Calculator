# -*- coding: utf-8 -*-
"""
sync-spirits 主流程：图鉴页 → 逐个详情页 → 组装 → (可选)合并进 data/spirits.js。

两步法（与 sync-skills 一致）：
  1. 下载/读取 nrc 精灵图鉴页，解析出全部精灵基础信息（含详情页链接）
  2. 用 requests 逐个抓取每个精灵详情页，解析 资质/特性/属性
  3. 组装成完整对象写入 .tmp/spirits_full.json
  4. 加 --merge 时，把「新精灵」（按 no+n 去重）追加进 data/spirits.js

默认只写 .tmp（不改动项目数据）；需显式 --merge 才会写入 data/spirits.js。

Usage:
    python sync_spirits.py [--gallery .tmp/spirit_gallery.html] [--out .tmp/spirits_full.json]
                           [--start-no N] [--end-no M] [--all] [--merge]
"""
import sys
import os
import json
import time
import pathlib
import argparse
import requests

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import extract_spirits
import fetch_spirit_detail as detail

GALLERY_URL = "https://wiki.biligame.com/nrc/%E7%B2%BE%E7%81%B5%E5%9B%BE%E9%89%B4"
HEADERS = detail.HEADERS
DETAIL_CACHE = ".tmp/spirit_details"

# 写入 data/spirits.js 的字段顺序（与现有文件一致）
FIELD_ORDER = ["no", "n", "hp", "pa", "ma", "pd", "md", "sp",
               "a1", "a2", "tr", "st", "img", "tr_desc"]


def download_gallery(url, out_path, retries=5):
    last = None
    for attempt in range(1, retries + 1):
        try:
            r = requests.get(url, headers=HEADERS, timeout=60)
            r.encoding = "utf-8"
            if r.status_code == 200:
                pathlib.Path(out_path).parent.mkdir(parents=True, exist_ok=True)
                pathlib.Path(out_path).write_text(r.text, encoding="utf-8")
                print(f"gallery saved {len(r.text)}")
                return r.text
            last = r.status_code
            print(f"  [retry {attempt}/{retries}] gallery -> {r.status_code}")
        except Exception as e:
            last = e
            print(f"  [retry {attempt}/{retries}] gallery -> {e}")
        if attempt < retries:
            time.sleep(3 * attempt)
    raise RuntimeError(f"Failed to download gallery: {last}")


def assemble(base, det):
    """合并图鉴基础信息 + 详情解析结果。"""
    out = {
        "no": base["no"],
        "n": base["n"],
        "hp": det.get("hp"),
        "pa": det.get("pa"),
        "ma": det.get("ma"),
        "pd": det.get("pd"),
        "md": det.get("md"),
        "sp": det.get("sp"),
        "a1": det.get("a1") or base.get("a1", ""),
        "a2": det.get("a2") or base.get("a2", ""),
        "tr": det.get("tr", ""),
        "tr_desc": det.get("tr_desc", ""),
        "st": base.get("st", ""),
        "img": base.get("img", ""),
    }
    return out


def _is_complete(s):
    return all(isinstance(s.get(k), int) for k in ("hp", "pa", "ma", "pd", "md", "sp"))


def merge_into_js(full_list, js_path="data/spirits.js"):
    """把 full_list 中「新精灵」(按 no+n 去重) 追加进 spirits.js。"""
    text = pathlib.Path(js_path).read_text(encoding="utf-8")
    start = text.index("[", text.index("const SPIRITS"))
    end = text.rindex("]")
    existing = json.loads(text[start:end + 1])
    existing_keys = {(s.get("no"), s.get("n")) for s in existing}

    new = [s for s in full_list if (s["no"], s["n"]) not in existing_keys]
    if not new:
        print("merge: no new spirits to add.")
        return 0

    # 生成插入块（4 空格缩进，与现有格式一致）
    blocks = []
    for s in new:
        obj = ",\n".join(
            f'        "{k}": {json.dumps(s[k], ensure_ascii=False)}'
            if not isinstance(s[k], str)
            else f'        "{k}": {json.dumps(s[k], ensure_ascii=False)}'
            for k in FIELD_ORDER
        )
        blocks.append("    {\n" + obj + "\n    }")
    inner = "\n".join(blocks)

    # 备份到 .tmp/
    pathlib.Path(".tmp").mkdir(parents=True, exist_ok=True)
    bak = pathlib.Path(".tmp") / (pathlib.Path(js_path).name + ".bak")
    bak.write_text(text, encoding="utf-8")
    print(f"merge: backup -> {bak}")

    # 在最后的 \n] 之前插入
    idx = text.rfind("\n]")
    new_text = text[:idx] + ",\n" + inner + "\n" + text[idx:]
    pathlib.Path(js_path).write_text(new_text, encoding="utf-8")
    print(f"merge: appended {len(new)} spirits.")
    return len(new)


def _load_existing(js_path="data/spirits.js"):
    """读取 data/spirits.js 中已有 SPIRITS（容错：文件为空/损坏时返回 []）。"""
    try:
        text = pathlib.Path(js_path).read_text(encoding="utf-8")
        i = text.index("const SPIRITS")
        start = text.index("[", i)
        end = text.rindex("]")
        data = json.loads(text[start:end + 1])
        if isinstance(data, list):
            return data
    except Exception:
        pass
    return []


def _render_js(spirits):
    """把精灵 dict 列表渲染成 data/spirits.js 的全局常量格式（4 空格缩进、无前导逗号）。"""
    blocks = []
    for s in spirits:
        obj = ",\n".join(
            f'        "{k}": {json.dumps(s.get(k), ensure_ascii=False)}'
            for k in FIELD_ORDER
        )
        blocks.append("    {\n" + obj + "\n    }")
    inner = ",\n".join(blocks)
    return "const SPIRITS =\n[\n" + inner + "\n]\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gallery", default=".tmp/spirit_gallery.html")
    ap.add_argument("--out", default=".tmp/spirits_full.json")
    ap.add_argument("--start-no", type=int, default=1)
    ap.add_argument("--end-no", type=int, default=9999)
    ap.add_argument("--limit", type=int, default=None, help="最多抓取 N 个（用于测试，过滤后再截断）")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--merge", action="store_true", help="追加新精灵到 data/spirits.js")
    args = ap.parse_args()

    if pathlib.Path(args.gallery).exists():
        html = pathlib.Path(args.gallery).read_text(encoding="utf-8")
    else:
        html = download_gallery(GALLERY_URL, args.gallery)

    bases = extract_spirits.parse_gallery(html)
    if not args.all:
        bases = [b for b in bases
                 if (lambda x: args.start_no <= int(x) <= args.end_no if x.isdigit() else False)(b["no"])]
    if args.limit is not None:
        bases = bases[:args.limit]
    print(f"to fetch details for {len(bases)} spirits")

    results, errors = [], []
    # 抓取统一用 requests（见 fetch_spirit_detail.fetch_detail）。

    # 合并：一次性读出已存在精灵，新精灵先在内存累积，一轮结束后统一落盘。
    existing = _load_existing("data/spirits.js") if args.merge else []
    existing_keys = {(s.get("no"), s.get("n")) for s in existing}
    merged = list(existing)

    done = 0
    for base in bases:
        done += 1
        status = "OK"
        try:
            det = detail.fetch_detail(base["detail_url"], DETAIL_CACHE,
                                      key=base["no"] + base["n"])
            full = assemble(base, det)
            if _is_complete(full):
                results.append(full)
            else:
                errors.append({"no": base["no"], "n": base["n"], "error": "incomplete stats"})
                status = "incomplete"
        except Exception as e:
            errors.append({"no": base["no"], "n": base["n"], "error": str(e)})
            status = "ERR"
        # 成功的「新」精灵先入内存（已存在则跳过），一轮结束后统一落盘
        if args.merge and status == "OK":
            key = (full["no"], full["n"])
            if key not in existing_keys:
                existing_keys.add(key)
                merged.append(full)
        print(f"  [{done}/{len(bases)}] {base['no']} {base['n']} -> {status}", flush=True)

    # 一轮结束，有新增才写 data/spirits.js（写前备份原文件到 .tmp/）
    if args.merge and len(merged) > len(existing):
        pathlib.Path(".tmp").mkdir(parents=True, exist_ok=True)
        bak = pathlib.Path(".tmp") / "spirits.js.bak"
        bak.write_text(pathlib.Path("data/spirits.js").read_text(encoding="utf-8"),
                       encoding="utf-8")
        print(f"merge: backup -> {bak}")
        pathlib.Path("data/spirits.js").write_text(_render_js(merged), encoding="utf-8")

    results.sort(key=lambda s: int(s["no"]) if s["no"].isdigit() else 9999)
    pathlib.Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"Output written to: {args.out} ({len(results)} ok, {len(errors)} errors)")
    if errors:
        for e in errors[:10]:
            print("  ERR", e["no"], e["n"], e.get("error"))
        # 清掉失败精灵的详情页缓存（若存在）：incomplete 页会留下坏缓存导致
        # 重跑持续失败，删除后下次重跑会重新抓取；抓取失败(如 567)本无缓存
        removed = [e for e in errors if detail.delete_cache(e["no"] + e["n"], DETAIL_CACHE)]
        if removed:
            print(f"cache: removed {len(removed)} bad cache file(s) for failed spirits")

    if args.merge:
        print(f"merge done: +{len(merged) - len(existing)} spirits (file now has {len(merged)})")
    else:
        print("(--merge not set; data/spirits.js untouched)")


if __name__ == "__main__":
    main()
