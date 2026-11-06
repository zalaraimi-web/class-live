#!/bin/bash
# ============================================================
#  Class Live — double-click this file to start the game.
#  Nothing to install: if this Mac has no Node.js, a private
#  copy is downloaded once into this folder (about 45 MB),
#  checked against Node.js's official checksum, and reused.
# ============================================================
NODE_VERSION="v22.12.0"
NODE_DIST="${CLASSLIVE_NODE_DIST:-https://nodejs.org/dist}"

cd "$(dirname "$0")" || exit 1
HERE="$(pwd)"
clear 2>/dev/null
printf '\n  \033[1;33m★ Class Live\033[0m — starting…\n\n'

# Let macOS run the files in this folder without asking again next time.
xattr -dr com.apple.quarantine "$HERE" 2>/dev/null

fail() {
  printf '\n  \033[1;31m✖ %s\033[0m\n' "$1"
  [ -n "$2" ] && printf '    %s\n' "$2"
  printf '\n  Press Return to close this window.'
  read -r _
  exit 1
}

node_ok() {  # usable Node.js (version 18 or newer)?
  [ -x "$1" ] && "$1" -e 'process.exit(+process.versions.node.split(".")[0] >= 18 ? 0 : 1)' >/dev/null 2>&1
}

NODE=""
for cand in "$HERE/.runtime/bin/node" "$(command -v node 2>/dev/null)" /opt/homebrew/bin/node /usr/local/bin/node; do
  if [ -n "$cand" ] && node_ok "$cand"; then NODE="$cand"; break; fi
done

if [ -z "$NODE" ]; then
  case "$(uname -m)" in arm64|aarch64) ARCH="arm64" ;; *) ARCH="x64" ;; esac
  case "$(uname -s)" in Darwin) OSNAME="darwin" ;; Linux) OSNAME="linux" ;; *) fail "This launcher is for Mac." ;; esac
  PKG="node-$NODE_VERSION-$OSNAME-$ARCH"
  printf '  First start on this Mac: getting the game engine (one time only)…\n\n'
  TMP="$HERE/.runtime-download"
  rm -rf "$TMP"; mkdir -p "$TMP" || fail "Could not write inside the Class Live folder." "Move the folder to your Desktop or Documents and try again."
  curl -fL --progress-bar --retry 2 -o "$TMP/node.tar.gz" "$NODE_DIST/$NODE_VERSION/$PKG.tar.gz" \
    || fail "Could not download the game engine." "Check that this Mac is connected to the internet, then double-click again."
  curl -fsSL --retry 2 -o "$TMP/SHASUMS256.txt" "$NODE_DIST/$NODE_VERSION/SHASUMS256.txt" \
    || fail "Could not download the checksum file." "Check the internet connection, then double-click again."
  EXPECTED="$(grep " $PKG.tar.gz\$" "$TMP/SHASUMS256.txt" | awk '{print $1}')"
  ACTUAL="$(shasum -a 256 "$TMP/node.tar.gz" | awk '{print $1}')"
  if [ -z "$EXPECTED" ] || [ "$EXPECTED" != "$ACTUAL" ]; then
    rm -rf "$TMP"; fail "The download did not pass the safety check, so it was not used." "Please double-click again to retry."
  fi
  tar -xzf "$TMP/node.tar.gz" -C "$TMP" || fail "Could not unpack the game engine."
  rm -rf "$HERE/.runtime"; mv "$TMP/$PKG" "$HERE/.runtime" || fail "Could not set up the game engine."
  rm -rf "$TMP"
  NODE="$HERE/.runtime/bin/node"
  node_ok "$NODE" || fail "The game engine could not start on this Mac."
  printf '\n  ✓ Ready.\n'
fi

# Keep the Mac (and the board display) awake while the game runs.
if command -v caffeinate >/dev/null 2>&1; then
  caffeinate -di "$NODE" server.js --open
else
  "$NODE" server.js --open
fi
STATUS=$?
if [ $STATUS -ne 0 ]; then
  printf '\n  Class Live stopped with an error (see above). Press Return to close.'
  read -r _
fi
