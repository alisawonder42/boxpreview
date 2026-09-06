#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 /path/to/portfolio" >&2
  exit 1
fi

HERE="$(cd "$(dirname "$0")" && pwd)"
BOXPREVIEW="$(cd "$HERE/../.." && pwd)"
PORTFOLIO="$(cd "$1" && pwd)"

if [[ ! -f "$PORTFOLIO/src/content/projects.ts" ]]; then
  echo "That path does not look like the portfolio repo." >&2
  exit 1
fi

cd "$PORTFOLIO"
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Portfolio working tree is not clean. Commit or stash first." >&2
  exit 1
fi

branch="cursor/flat-the-box-1d74"
git checkout -B "$branch"

cp "$HERE/src/content/projects.ts" "$PORTFOLIO/src/content/projects.ts"
cp "$HERE/src/app/routing.ts" "$PORTFOLIO/src/app/routing.ts"
cp "$HERE/src/components/ProjectIndex.tsx" "$PORTFOLIO/src/components/ProjectIndex.tsx"
cp "$HERE/src/components/ProjectIndex.module.css" "$PORTFOLIO/src/components/ProjectIndex.module.css"
cp "$HERE/src/pages/ProjectPage.tsx" "$PORTFOLIO/src/pages/ProjectPage.tsx"
cp "$HERE/src/pages/ProjectPage.module.css" "$PORTFOLIO/src/pages/ProjectPage.module.css"

cd "$BOXPREVIEW"
npm run build
rm -rf "$PORTFOLIO/public/box"
mkdir -p "$PORTFOLIO/public/box"
cp -a dist/. "$PORTFOLIO/public/box/"
cat > "$PORTFOLIO/public/box/README.md" <<'EOF'
Standalone Box Preview build.

Regenerate from https://github.com/alisawonder42/boxpreview:

```bash
npm run build
cp -a dist/. ../portfolio/public/box/
```

The portfolio page iframes `/box/index.html?embed=1`.
EOF

echo "Portfolio branch $branch is ready. Review, commit, and open a PR."
