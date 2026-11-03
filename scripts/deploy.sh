#!/bin/sh
# Deploys the committed code to the Netlify site linked to this folder.
# Uses a clean `git archive` so untracked files aren't uploaded and the version stamp gets filled in.
# If config.local.js exists, it replaces js/config.js in the upload (keeping the stamp).
set -eu
out=$(mktemp -d)
git archive HEAD | tar -x -C "$out"
if [ -f config.local.js ]; then
  stamp=$(git log -1 --format='%cs %h')
  sed 's/\$Format:%cs %h\$/'"$stamp"'/' config.local.js > "$out/js/config.js"
  echo "Using config.local.js"
fi
netlify deploy --prod --dir "$out"
rm -rf "$out"
