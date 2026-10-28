#!/bin/bash
# Builds the earlier versions of the site, v1/ v2/ …, from the git tags site-v1, site-v2, …:
# only the page itself (index.html, static/, meditronfo/), never rubric/ or tracker/; each page is hidden from search engines.
# versions/index.html lists them; add a line there for a new tag.
set -euo pipefail
cd "$(dirname "$0")/.."
for tag in $(git tag -l 'site-v*' | sort -V); do
  v=${tag#site-}
  rm -rf "$v"; mkdir "$v"
  paths=(index.html static)
  if git cat-file -e "$tag:meditronfo" 2>/dev/null; then paths+=(meditronfo); fi
  git archive "$tag" "${paths[@]}" | tar -x -C "$v"
  for f in "$v/index.html" "$v/meditronfo/index.html"; do
    [ -f "$f" ] && sed -i '0,/<meta charset="utf-8">/s//<meta charset="utf-8">\n  <meta name="robots" content="noindex">/' "$f"
  done
  echo "$v from $tag ($(git rev-parse --short "$tag^{commit}")): $(du -sh "$v" | cut -f1)"
done
