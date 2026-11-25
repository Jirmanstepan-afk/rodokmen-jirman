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

# Nejdřív převzít cizí změny z GitHubu (jiný proces mohl mezitím nasadit) — nic se nepřepisuje.
git fetch origin main
if ! git merge-base --is-ancestor origin/main HEAD; then
  git pull --rebase --autostash origin main
  python3 scripts/validate-rodokmen.py
fi

git add .nojekyll .gitignore index.html mapa.html povolani.html robots.txt _headers JAK-DOPLNIT.md deploy.sh css js data img scripts/validate-rodokmen.py scripts/aron-snimky.py
if git diff --cached --quiet; then
  echo "Žádné změny k odeslání. Stránka: https://jirmanstepan-afk.github.io/rodokmen-jirman/"
  exit 0
fi

git commit -m "${COMMIT_MSG:-Aktualizace mapy rodokmenu.}"
if ! git push origin main; then
  git pull --rebase origin main
  git push origin main
fi
echo "Nasazeno. URL: https://jirmanstepan-afk.github.io/rodokmen-jirman/"
echo "GitHub Pages se obvykle obnoví během minuty."
