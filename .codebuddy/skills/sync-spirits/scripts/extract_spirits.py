"""
Extract spirit card data from the spirit gallery HTML page.
Parses <div class="dex-pet-card"> elements and outputs JSON.

Usage:
    python extract_spirits.py <input_html> <output_json> [--start-no N] [--end-no N]
"""

import re
import json
import argparse
import sys
import os


def parse_html(html: str):
    """
    Parse the HTML and extract all spirit cards.
    
    Each card structure:
    <div class="divsort dex-card dex-pet-card" 
         data-param0="0" data-param1="stage" data-param2="type1"
         data-param3="type2" data-param4="form1" data-param5="form2"
         data-param6="shiny" data-param7="evo_pos" data-param8="season"
         data-dex-search="..." style="...">
      <div class="dex-pet-card-face">
        <div class="dex-card-body">
          <div class="dex-card-kicker">NO.001<span>stage</span></div>
          <div class="dex-card-name"><a href="/rocom/..." title="name">name</a></div>
          <div class="dex-card-subtitle">...</div>
        </div>
        <div class="dex-pet-art"><a href="..." title="..."><img src="..." /></a></div>
        <div class="dex-card-types">
          <span class="dex-type"><img/><span>type</span></span>
          ...
        </div>
      </div>
    </div>
    """
    results = []
    
    # Pattern to match each complete dex-pet-card with its nested divs
    # The card consists of: outer div (.dex-pet-card) containing .dex-pet-card-face
    # which contains .dex-card-body, .dex-pet-art, .dex-card-types
    card_pattern = re.compile(
        r'<div\s[^>]*dex-pet-card[^>]*>'
        r'(.*?)'
        r'</div>\s*</div>\s*</div>',
        re.DOTALL
    )
    
    for match in card_pattern.finditer(html):
        card_html = match.group(0)
        inner = match.group(1)
        
        # Extract data-param attributes
        params = dict(re.findall(r'data-param(\d+)="([^"]*)"', card_html))
        
        # Extract dex-card-kicker (NO.xxx + stage)
        kicker_match = re.search(r'dex-card-kicker[^>]*>(.*?)</div>', inner, re.DOTALL)
        kicker_text = kicker_match.group(1).strip() if kicker_match else ""
        
        # Extract NO number
        no_match = re.search(r'NO\.(\d+)', kicker_text)
        no = no_match.group(1) if no_match else ""
        
        # Extract stage from span inside kicker
        stage_span = re.search(r'<span>(.*?)</span>', kicker_text)
        stage = stage_span.group(1) if stage_span else params.get("1", "")
        
        # Extract name
        name_match = re.search(r'dex-card-name[^>]*>\s*<a[^>]*title="([^"]*)"[^>]*>(.*?)</a>', inner, re.DOTALL)
        name = name_match.group(1) if name_match else ""
        
        # Extract detail URL
        href_match = re.search(r'dex-card-name[^>]*>\s*<a\s+href="([^"]*)"', inner)
        detail_url = ""
        if href_match:
            href = href_match.group(1)
            detail_url = f"https://wiki.biligame.com{href}" if href.startswith('/') else href
        
        # Extract subtitle (form info)
        subtitle_match = re.search(r'dex-card-subtitle[^>]*>(.*?)</div>', inner, re.DOTALL)
        subtitle = subtitle_match.group(1).strip() if subtitle_match else ""
        # Normalize &nbsp; and empty subtitles
        if subtitle in ("&#160;", "&nbsp;", ""):
            subtitle = ""
        
        # Extract image URL
        img_match = re.search(r'<img[^>]*src="([^"]*)"', inner)
        img_url = img_match.group(1) if img_match else ""
        
        # Extract types from .dex-card-types
        types = []
        type_matches = re.findall(r'dex-type[^>]*>\s*(?:<img[^>]*>)?\s*<span>(.*?)</span>', inner)
        for t in type_matches:
            types.append(t.strip())
        
        # Build spirit data
        spirit = {
            "no": no,
            "n": name,
            "stage": stage,
            "a1": params.get("2", ""),
            "a2": params.get("3", ""),
            "form1": params.get("4", ""),
            "form2": params.get("5", ""),
            "has_shiny": params.get("6", ""),
            "evo_pos": params.get("7", ""),
            "season": params.get("8", ""),
            "subtitle": subtitle,
            "img": img_url,
            "detail_url": detail_url,
            "types": types,
        }
        
        # Build st (stage/form combined)
        st_parts = []
        if params.get("4") and params.get("4") not in ("原始形态", "首领形态"):
            st_parts.append(params["4"])
        if params.get("5") and params["5"] != "主形态":
            st_parts.append(params["5"])
        if stage:
            st_parts.append(stage)
        spirit["st"] = "/".join(st_parts) if st_parts else ""
        
        results.append(spirit)
    
    return results


def main():
    parser = argparse.ArgumentParser(description="Extract spirit cards from HTML page")
    parser.add_argument("input", help="Input HTML file path")
    parser.add_argument("output", help="Output JSON file path")
    parser.add_argument("--start-no", type=int, default=1, help="Starting spirit number (inclusive)")
    parser.add_argument("--end-no", type=int, default=9999, help="Ending spirit number (inclusive)")
    parser.add_argument("--all", action="store_true", help="Output all spirits (ignore filter)")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input):
        print(f"Error: Input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)
    
    with open(args.input, "r", encoding="utf-8") as f:
        html = f.read()
    
    spirits = parse_html(html)
    print(f"Parsed {len(spirits)} spirits from HTML")
    
    # Filter by number range
    if not args.all:
        filtered = []
        for s in spirits:
            try:
                no_int = int(s["no"])
                if args.start_no <= no_int <= args.end_no:
                    filtered.append(s)
            except ValueError:
                pass
        print(f"After filtering (no {args.start_no}-{args.end_no}): {len(filtered)} spirits")
        spirits = filtered
    
    # Sort by no
    spirits.sort(key=lambda s: int(s["no"]) if s["no"].isdigit() else 9999)
    
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(spirits, f, ensure_ascii=False, indent=2)
    
    print(f"Output written to: {args.output}")
    
    # Print summary
    for s in spirits[:5]:
        print(f"  NO.{s['no']:>3s} {s['n']:<8s} | {s['a1']}/{s['a2']} | st={s['st']}")
    if len(spirits) > 5:
        print(f"  ... and {len(spirits) - 5} more")


if __name__ == "__main__":
    main()
