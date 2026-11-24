#!/bin/sh
# Jedním příkazem: ověř data a nasaď na GitHub Pages
# (stejný postup jako mapa obchodních partnerů: Jirmanstepan-afk, větev main, kořen webu).
set -e
cd "$(dirname "$0")"
python3 scripts/validate-rodokmen.py

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "V tomto adresáři není git repozitář." >&2
  exit 2
fi
if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Chybí git remote origin (očekává se https://github.com/Jirmanstepan-afk/rodokmen-jirman)." >&2
  exit 2
fi

git add .nojekyll .gitignore index.html robots.txt _headers JAK-DOPLNIT.md deploy.sh css js data scripts/validate-rodokmen.py
if git diff --cached --quiet; then
  echo "Žádné změny k odeslání. Stránka: https://jirmanstepan-afk.github.io/rodokmen-jirman/"
  exit 0
fi

git commit -m "Aktualizace mapy rodokmenu."
git push origin main
echo "Nasazeno. URL: https://jirmanstepan-afk.github.io/rodokmen-jirman/"
echo "GitHub Pages se obvykle obnoví během minuty."
