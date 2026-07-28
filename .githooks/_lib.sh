#!/bin/sh
# Shared helpers for this repo's tracked hooks. Sourced by .githooks/*, never run
# directly. The secret scan lives here in ONE place so the pre-commit and pre-push
# copies cannot drift apart.

# PATH first, then the conventional ~/.local/bin drop (no Homebrew on some machines).
GITLEAKS="$(command -v gitleaks 2>/dev/null || printf '%s' "$HOME/.local/bin/gitleaks")"

# Echoes install instructions and fails when the scanner is absent.
#   0 = scanner present   1 = deliberately skipped   2 = missing, not allowed
gitleaks_available() {
  [ -x "$GITLEAKS" ] && return 0

  if [ -n "$ALLOW_NO_GITLEAKS" ]; then
    printf 'i gitleaks not installed - secret scan SKIPPED (ALLOW_NO_GITLEAKS set)\n'
    return 1
  fi

  printf '\n\033[31mx Blocked: gitleaks is not installed.\033[0m\n'
  printf '  This repo scans for secrets before they can enter history, so a machine\n'
  printf '  without the scanner is not allowed to write history. A silent skip is how\n'
  printf '  an unscanned secret gets pushed from a half-set-up laptop.\n\n'
  printf '  Install it:\n'
  printf '    brew install gitleaks\n'
  printf '  or, with no Homebrew, grab the darwin_arm64 asset from\n'
  printf '    https://github.com/gitleaks/gitleaks/releases\n'
  printf '    tar -xzf gitleaks_*_darwin_arm64.tar.gz -C ~/.local/bin gitleaks\n'
  printf '    # then make sure ~/.local/bin is on your PATH\n\n'
  printf '  Accept the risk for one command: ALLOW_NO_GITLEAKS=1 git ...\n\n'
  return 2
}

# Scan what is staged, before it becomes a commit.
secret_scan_staged() {
  gitleaks_available
  case $? in
    1) return 0 ;;
    2) return 1 ;;
  esac

  "$GITLEAKS" git --staged --no-banner && return 0

  printf '\nx Commit blocked: possible secret in staged changes (see above).\n'
  printf '  Bypass: git commit --no-verify\n'
  return 1
}

# Scan a single rev range being pushed. Caller loops over refs from stdin.
secret_scan_range() {
  "$GITLEAKS" git --no-banner --log-opts="$1"
}
