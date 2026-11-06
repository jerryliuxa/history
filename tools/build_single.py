# -*- coding: utf-8 -*-
"""把 history-atlas 打包成单文件 HTML（内联 css/js），输出到指定路径。

用法: python -I tools/build_single.py <输出路径>
"""
import os
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
    app = read("js", "app.js")

    html = html.replace(
        '<link rel="stylesheet" href="css/style.css">',
        "<style>\n" + css + "\n</style>",
    )
    html = html.replace(
        '<script src="js/land.js"></script>',
        "<script>\n" + land + "\n</script>",
    )
    html = html.replace(
        '<script src="js/data.js"></script>',
        "<script>\n" + data + "\n</script>",
    )
    html = html.replace(
        '<script src="js/app.js"></script>',
        "<script>\n" + app + "\n</script>",
    )
    for token in ('<link rel="stylesheet"', '<script src='):
        if token in html:
            raise SystemExit("仍有未内联的外部引用: " + token)

    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    print("written:", out, os.path.getsize(out), "bytes")


if __name__ == "__main__":
    main()
