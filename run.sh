#!/usr/bin/env bash
# Run Xenia Linux Manager for local testing.
#
#   ./run.sh            launch the real Electron app (real data, opens a window)
#   ./run.sh --preview  themed UI preview in a browser (stubbed bridge, no sidecar/display)
#   ./run.sh --build    force-rebuild the Rust sidecar before launching
#
set -euo pipefail
cd "$(dirname "$0")"

PREVIEW=0
FORCE_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --preview) PREVIEW=1 ;;
    --build)   FORCE_BUILD=1 ;;
    -h|--help)
      cat <<'EOF'
Run Xenia Linux Manager for local testing.

  ./run.sh            launch the real Electron app (real data, opens a window)
  ./run.sh --preview  themed UI preview in a browser (stubbed data, no window)
  ./run.sh --build    force-rebuild the Rust sidecar before launching
EOF
      exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 1 ;;
  esac
done

# 1. Node dependencies
if [ ! -d node_modules ]; then
  echo "==> Installing npm dependencies..."
  npm install
fi

# 2. Themed preview — no sidecar, no display needed (good for theme/UI testing)
if [ "$PREVIEW" -eq 1 ]; then
  echo "==> Building renderer..."
  npm run build
  echo "==> Serving themed preview at http://localhost:8771/index.html"
  echo "    Stubbed data; open the URL in a browser. Ctrl-C to stop."
  exec node .claude/skills/run-app/preview.mjs --serve 8771
fi

# 3. Electron binary guard (npm install can leave it unextracted on some machines)
if [ ! -x node_modules/electron/dist/electron ]; then
  echo "==> Electron binary missing; running electron's install step..."
  node node_modules/electron/install.js
fi

# 4. Rust sidecar (xlm-core) — main process spawns it; dev fails without it
SIDECAR=core/target/release/xlm-core
if [ "$FORCE_BUILD" -eq 1 ] || [ ! -x "$SIDECAR" ]; then
  echo "==> Building xlm-core sidecar (cargo build --release)..."
  cargo build --release --bin xlm-core --manifest-path core/Cargo.toml
fi

# 5. Launch the real app (renderer dev server + Electron window)
echo "==> Launching Xenia Linux Manager..."
exec npm run dev
