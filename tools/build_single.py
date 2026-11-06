# -*- coding: utf-8 -*-
"""把 history-atlas 打包成单文件 HTML（内联 css/js），输出到指定路径。

用法: python -I tools/build_single.py <输出路径>
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*p):
    with open(os.path.join(ROOT, *p), "r", encoding="utf-8") as f:
        return f.read()


def main():
    out = sys.argv[1]
    html = read("index.html")
    css = read("css", "style.css")
    land = read("js", "land.js")
    data = read("js", "data.js")
    sources = read("js", "sources.js")
    app = read("js", "app.js")

    # 兼容带版本参数的引用（如 href="css/style.css?v=15"）
    html = re.sub(r'<link rel="stylesheet" href="css/style\.css[^"]*">',
                  lambda _: "<style>\n" + css + "\n</style>", html)
    html = re.sub(r'<script src="js/land\.js[^"]*"></script>',
                  lambda _: "<script>\n" + land + "\n</script>", html)
    html = re.sub(r'<script src="js/data\.js[^"]*"></script>',
                  lambda _: "<script>\n" + data + "\n</script>", html)
    html = re.sub(r'<script src="js/sources\.js[^"]*"></script>',
                  lambda _: "<script>\n" + sources + "\n</script>", html)
    html = re.sub(r'<script src="js/app\.js[^"]*"></script>',
                  lambda _: "<script>\n" + app + "\n</script>", html)
    for token in ('<link rel="stylesheet"', '<script src='):
        if token in html:
            raise SystemExit("仍有未内联的外部引用: " + token)

    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    print("written:", out, os.path.getsize(out), "bytes")


if __name__ == "__main__":
    main()
