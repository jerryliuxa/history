# -*- coding: utf-8 -*-
"""把 Natural Earth 110m land GeoJSON 预处理成紧凑的 JS 数据文件。

用法: python -I tools/prep_land.py data/land110m.json js/land.js
处理: 坐标取整 2 位小数、去相邻重复点、外环/内环(内海)分离、过滤过小多边形。
"""
import json
import sys


def clean_ring(ring, min_extent):
    out = []
    last = None
    for pt in ring:
        p = (round(pt[0], 2), round(pt[1], 2))
        if p != last:
            out.append(p)
            last = p
    # 去掉 SVG 里多余的闭合点（path 用 Z 闭合）
    if len(out) >= 2 and out[0] == out[-1]:
        out.pop()
    if len(out) < 3:
        return None
    xs = [p[0] for p in out]
    ys = [p[1] for p in out]
    if (max(xs) - min(xs)) + (max(ys) - min(ys)) < min_extent:
        return None
    return out


def main():
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, "r", encoding="utf-8") as f:
        gj = json.load(f)

    outers, holes = [], []
    for feat in gj["features"]:
        g = feat["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for rings in polys:
            outer = clean_ring(rings[0], 0.4)
            if outer:
                outers.append(outer)
            for hole in rings[1:]:
                h = clean_ring(hole, 0.3)
                if h:
                    holes.append(h)

    def ser(ring):
        return "[" + ",".join("[%s,%s]" % (lon, lat) for lon, lat in ring) + "]"

    body_o = "[" + ",".join(ser(r) for r in outers) + "]"
    body_h = "[" + ",".join(ser(r) for r in holes) + "]"
    js = (
        "/* 由 data/land110m.json (Natural Earth 110m land) 预处理生成: "
        "取整/去重/内外环分离/去小岛 */\n"
        "var LAND_OUTER = " + body_o + ";\n"
        "var LAND_HOLES = " + body_h + ";\n"
    )
    with open(dst, "w", encoding="utf-8") as f:
        f.write(js)
    print("outers=%d holes=%d bytes=%d" % (len(outers), len(holes), len(js)))


if __name__ == "__main__":
    main()
