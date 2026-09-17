#!/usr/bin/env bash
# init.sh · {{PROGRAM_TITLE}}
# One command that boots the environment and proves the current build still works end to end.
# Written by the framer pass. Verified from a clean checkout by a person before the first build pass.
# Exit non-zero on any failure so the pass records it as its finding.
set -euo pipefail

echo "== stop flag =="
if [ -f KILL ]; then echo "KILL present: $(cat KILL)"; exit 3; fi

echo "== where =="
pwd
git log --oneline -5 2>/dev/null || echo "no git history yet"

echo "== boot =="
{{start dependencies, dev server, or nothing for a document program}}

echo "== smoke =="
{{the one check that proves the build is alive: a fetch of the live address, a render of the document, a row count on the workbook, a test that must pass}}

echo "== state =="
python3 - <<'PY'
import json
u=json.load(open('units.json'))['units']
p=sum(1 for x in u if x['passes'])
print(f"units verified: {p} of {len(u)}")
c=json.load(open('units.json')).get('continuous',{})
print("continuous:", "commanded by principal on "+str(c.get('date')) if c.get('commanded') else "off (one pass per invocation)")
PY
echo "init ok"
