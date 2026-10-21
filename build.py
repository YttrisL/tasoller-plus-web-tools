#!/usr/bin/env python3
"""Builds release/index.html, a single self-contained page, from the files in src/.

    python build.py            write release/index.html
    python build.py --check    do not write; exit 1 if release/index.html is not up to date

src/index.html is the template. A line that holds only an include marker is replaced by the content of the
named file (path relative to src/), recursively:

    <!-- @include views/config.html -->      in HTML
    /* @include styles/base.css */           in CSS
    // @include js/app/main.js               in JavaScript

Files are inserted as they are (they must end with a newline), so the build is a plain concatenation; the output
uses the line ending set by LINE_ENDING below. The project keeps to plain ASCII, the build fails on any other
character.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")
OUT = os.path.join(HERE, "release", "index.html")
# release/index.html has Windows line endings, like the page had before it was split. Use "\n" for LF instead.
LINE_ENDING = "\r\n"
MARKER = re.compile(r"^[ \t]*(?:<!--|/\*|//)[ \t]*@include[ \t]+(\S+?)[ \t]*(?:-->|\*/)?[ \t]*$")


def expand(rel, stack=()):
    if rel in stack:
        raise SystemExit("include loop: " + " -> ".join(stack + (rel,)))
    path = os.path.join(SRC, rel)
    if not os.path.isfile(path):
        raise SystemExit("missing include: %s (from %s)" % (rel, stack[-1] if stack else "-"))
    with open(path, newline="") as f:
        text = f.read().replace("\r\n", "\n")      # sources may use either line ending
    if text and not text.endswith("\n"):
        raise SystemExit("%s does not end with a newline" % rel)
    out = []
    for line in text.split("\n")[:-1]:
        m = MARKER.match(line)
        out.append(expand(m.group(1), stack + (rel,)) if m else line + "\n")
    return "".join(out)


def main():
    check = "--check" in sys.argv[1:]
    result = expand("index.html")
    bad = [(i + 1, c) for i, line in enumerate(result.split("\n")) for c in line if ord(c) > 127]
    if bad:
        raise SystemExit("non-ASCII character in the result (line %d): %r" % bad[0])
    data = result.replace("\n", LINE_ENDING)
    if check:
        current = open(OUT, newline="").read() if os.path.isfile(OUT) else None
        if current != data:
            print("release/index.html is out of date, run: python build.py")
            return 1
        print("release/index.html is up to date")
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", newline="") as f:
        f.write(data)
    print("wrote release/index.html (%d bytes, %d lines)" % (len(data.encode()), result.count("\n")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
