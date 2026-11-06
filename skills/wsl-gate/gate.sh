#!/usr/bin/env bash
# The executable half of the wsl-gate skill: prepare a WSL landing clone, gate
# it, run one test file and bundle the result.
#
# Run this inside WSL (Ubuntu 24.04). It only ever touches its own landing
# clone. It never pushes, force-updates, rebases or amends; landing the bundle
# on Windows stays a manual step in SKILL.md (steps 5 and 6).
#
# Environment:
#   ULTIMATE_TOOLS    Toolchain prefix with node/bin, wrappers/pnpm and at least
#                     one git-*/usr/bin. Detected from $HOME/ultimate-*-tools;
#                     when none is found, $HOME/ultimate-10789-tools is tried.
#   WSL_GATE_CLONE    Landing clone owned by this script
#                     (default: $HOME/wsl-gate/landing).
#   WSL_GATE_SOURCE   The Windows checkout as WSL sees it, needed only to create
#                     the clone. When unset, the current git checkout is used.
#                     Later runs fetch from the clone's origin.
#   WSL_GATE_BUNDLE   Default bundle path for `bundle`
#                     (default: $HOME/wsl-gate/landing.bundle).
#   WSL_GATE_GIT_NAME, WSL_GATE_GIT_EMAIL
#                     Identity for the merge commit
#                     (defaults: "Ultimate Gate" / gate@localhost).
#
# Usage:
#   gate.sh prepare <branch> <conversation> [<expected-tip>] [--no-merge]
#   gate.sh gate [check|test|e2e ...]
#   gate.sh alone <test-file>
#   gate.sh bundle [path]
#
# The first `prepare` creates the clone at origin/dev/lxy. With --no-merge it
# stops there so the base can be gated; call it again without the flag to merge
# the fetched branch with --no-ff. A bare `gate` runs check, test and e2e in that
# order and stops at the first red. Naming phases is only for a quick partial
# run during development, never for a landing.

set -euo pipefail

SCRIPT_NAME="${0##*/}"
CLONE="${WSL_GATE_CLONE:-$HOME/wsl-gate/landing}"

die() {
  printf '%s: %s\n' "$SCRIPT_NAME" "$*" >&2
  exit 2
}

usage() {
  sed -n '/^# Usage:/,/^# The first/p' "$0" | sed 's/^# \{0,1\}//'
}

load_now() {
  cut -d' ' -f1 /proc/loadavg
}

setup_toolchain() {
  local prefix="${ULTIMATE_TOOLS:-}"
  if [[ -z "$prefix" ]]; then
    local candidates=("$HOME"/ultimate-*-tools)
    local candidate
    for candidate in "${candidates[@]}"; do
      if [[ -d "$candidate/node/bin" && -d "$candidate/wrappers" ]]; then
        prefix="$candidate"
        break
      fi
    done
    [[ -n "$prefix" ]] || prefix="$HOME/ultimate-10789-tools"
  fi
  [[ -d "$prefix" ]] || die "toolchain prefix not found: $prefix (set ULTIMATE_TOOLS)"

  local git_bins=("$prefix"/git-*/usr/bin)
  [[ -d "${git_bins[0]}" ]] || die "no git-*/usr/bin under $prefix"
  local git_bin
  git_bin="$(printf '%s\n' "${git_bins[@]}" | sort -V | tail -n 1)"
  local git_core="${git_bin%/usr/bin}/usr/lib/git-core"
  [[ -d "$git_core" ]] || die "git exec path not found: $git_core"

  local libs=("$prefix"/debs/root/usr/lib/*-linux-gnu)
  if [[ -d "${libs[0]}" ]]; then
    export LD_LIBRARY_PATH="${libs[0]}${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  fi

  [[ -x "$prefix/node/bin/node" ]] || die "node not found under $prefix/node/bin"
  [[ -x "$prefix/wrappers/pnpm" ]] || die "pnpm wrapper not found: $prefix/wrappers/pnpm"

  export PATH="$git_bin:$git_core:$prefix/node/bin:$prefix/wrappers:$PATH"
  export GIT_EXEC_PATH="$git_core"

  "$prefix/node/bin/node" --version >/dev/null 2>&1 ||
    die "node under $prefix does not run; check LD_LIBRARY_PATH and the toolchain"
  command -v pnpm >/dev/null 2>&1 || die "pnpm is not on PATH after setting up $prefix"
}

require_clone() {
  [[ -d "$CLONE/.git" ]] || die "no landing clone at $CLONE (run prepare first)"
  local branch
  if ! branch="$(git -C "$CLONE" symbolic-ref --quiet --short HEAD)"; then
    die "the landing clone is on a detached HEAD; run prepare to put it on dev/lxy"
  fi
  [[ "$branch" == "dev/lxy" ]] || die "the landing clone is on $branch, not dev/lxy"
  local status
  status="$(git -C "$CLONE" status --porcelain)"
  [[ -z "$status" ]] || die "the landing clone is dirty:"$'\n'"$status"
  if git -C "$CLONE" ls-files --eol | grep -E 'i/crlf|w/crlf' >/dev/null; then
    die "the landing clone has CRLF line endings; fix .gitattributes before gating"
  fi
}

set_identity() {
  git -C "$CLONE" config user.name "${WSL_GATE_GIT_NAME:-Ultimate Gate}"
  git -C "$CLONE" config user.email "${WSL_GATE_GIT_EMAIL:-gate@localhost}"
}

pnpm_install() {
  printf 'prepare: pnpm install --frozen-lockfile\n'
  ( cd "$CLONE" && pnpm install --frozen-lockfile )
}

resolve_source() {
  local source="${WSL_GATE_SOURCE:-}"
  if [[ -z "$source" ]]; then
    if git -C "$PWD" rev-parse --show-toplevel >/dev/null 2>&1; then
      source="$(git -C "$PWD" rev-parse --show-toplevel)"
    else
      die "WSL_GATE_SOURCE is not set and $PWD is not a git checkout; point it at the Windows checkout"
    fi
  fi
  source="$(realpath "$source")"
  [[ -d "$source" ]] || die "source checkout not found: $source"
  git -C "$source" rev-parse --git-dir >/dev/null 2>&1 || die "not a git checkout: $source"
  local common
  common="$(git -C "$source" rev-parse --path-format=absolute --git-common-dir)"
  if [[ "$(basename "$common")" == ".git" ]]; then
    dirname "$common"
  else
    printf '%s\n' "$source"
  fi
}

run_phase() {
  local name="$1"
  shift
  local before after rc
  before="$(load_now)"
  printf '\n== %s: %s (load %s)\n' "$name" "$*" "$before"
  if ( cd "$CLONE" && "$@" ); then
    rc=0
  else
    rc=$?
  fi
  after="$(load_now)"
  printf '== %s: exit %d (load %s)\n' "$name" "$rc" "$after"
  return "$rc"
}

cmd_prepare() {
  local branch=""
  local conversation=""
  local expected=""
  local merge=1
  while (($#)); do
    case "$1" in
      --no-merge)
        merge=0
        ;;
      --*)
        die "unknown option: $1"
        ;;
      *)
        if [[ -z "$branch" ]]; then
          branch="$1"
        elif [[ -z "$conversation" ]]; then
          conversation="$1"
        elif [[ -z "$expected" ]]; then
          expected="$1"
        else
          die "too many arguments"
        fi
        ;;
    esac
    shift
  done

  [[ -n "$branch" ]] || die "usage: $SCRIPT_NAME prepare <branch> <conversation> [<expected-tip>] [--no-merge]"
  [[ -n "$conversation" ]] || die "prepare needs the conversation number for the merge message"
  [[ "$conversation" =~ ^[0-9]+$ ]] || die "conversation must be a number: $conversation"
  branch="${branch#refs/heads/}"
  [[ "$branch" != "dev/lxy" ]] || die "refusing to land dev/lxy onto itself"
  git check-ref-format "refs/heads/$branch" >/dev/null || die "not a branch name: $branch"

  CLONE="$(realpath -m "$CLONE")"
  if [[ ! -e "$CLONE" ]]; then
    local source
    source="$(resolve_source)"
    printf 'prepare: cloning %s -> %s\n' "$source" "$CLONE"
    mkdir -p "$(dirname "$CLONE")"
    git clone "$source" "$CLONE"
    set_identity
    git -C "$CLONE" checkout -B dev/lxy refs/remotes/origin/dev/lxy
  elif [[ ! -d "$CLONE/.git" ]]; then
    die "$CLONE exists but is not a git checkout"
  fi

  require_clone
  git -C "$CLONE" fetch origin --prune
  if ! git -C "$CLONE" merge --ff-only origin/dev/lxy; then
    die "dev/lxy in $CLONE cannot fast-forward to origin/dev/lxy; choose a fresh WSL_GATE_CLONE"
  fi

  printf 'prepare: fetching %s as landing-branch\n' "$branch"
  if ! git -C "$CLONE" rev-parse --verify --quiet "refs/remotes/origin/$branch" >/dev/null; then
    die "branch not found on origin: $branch"
  fi
  if ! git -C "$CLONE" fetch origin "refs/heads/$branch:refs/heads/landing-branch"; then
    die "could not fetch $branch into landing-branch; the local landing-branch may be stale"
  fi

  local tip
  tip="$(git -C "$CLONE" rev-parse --verify refs/heads/landing-branch)"
  if [[ -n "$expected" ]]; then
    local expected_sha
    expected_sha="$(git -C "$CLONE" rev-parse --verify "${expected}^{commit}")"
    [[ "$tip" == "$expected_sha" ]] ||
      die "branch tip $tip does not match the expected $expected_sha"
  fi
  printf 'prepare: %s tip %s\n' "$branch" "$tip"

  pnpm_install

  if ((merge == 0)); then
    printf 'prepare: base at %s is ready; run "%s gate", then prepare again without --no-merge\n' \
      "$(git -C "$CLONE" rev-parse --short HEAD)" "$SCRIPT_NAME"
    return 0
  fi

  if git -C "$CLONE" merge-base --is-ancestor refs/heads/landing-branch HEAD; then
    printf 'prepare: %s is already merged at %s; nothing to do\n' \
      "$branch" "$(git -C "$CLONE" rev-parse --short HEAD)"
    return 0
  fi

  local ahead
  ahead="$(git -C "$CLONE" rev-list --count origin/dev/lxy..HEAD)"
  if ((ahead > 0)); then
    die "the landing clone is $ahead commit(s) ahead of origin/dev/lxy; choose a fresh WSL_GATE_CLONE"
  fi

  local short="${tip:0:7}"
  printf 'prepare: merging %s with --no-ff\n' "$short"
  git -C "$CLONE" merge --no-ff refs/heads/landing-branch \
    -m "Merge $short from #$conversation into dev/lxy"
  pnpm_install
  printf 'prepare: head %s\n' "$(git -C "$CLONE" rev-parse HEAD)"
}

cmd_gate() {
  require_clone
  local -a phases=()
  local phase
  if (($# == 0)); then
    phases=(check test e2e)
  else
    for phase in "$@"; do
      case "$phase" in
        check | test | e2e) phases+=("$phase") ;;
        *) die "unknown phase: $phase (expected check, test or e2e)" ;;
      esac
    done
  fi
  if ((${#phases[@]} < 3)); then
    printf 'gate: PARTIAL gate (%s); this is not a landing gate\n' "${phases[*]}" >&2
  fi

  printf 'gate: %s at %s (load %s)\n' \
    "$CLONE" "$(git -C "$CLONE" rev-parse --short HEAD)" "$(load_now)"

  local failed=""
  local rc=0
  local -a command
  for phase in "${phases[@]}"; do
    case "$phase" in
      check) command=(pnpm check) ;;
      test) command=(pnpm test) ;;
      e2e) command=(pnpm test:e2e) ;;
    esac
    if run_phase "gate:$phase" "${command[@]}"; then
      :
    else
      rc=$?
      failed="$phase"
      break
    fi
  done

  if [[ -n "$failed" ]]; then
    printf 'gate: FAILED in %s (exit %d); not running the remaining phases\n' "$failed" "$rc" >&2
    return "$rc"
  fi
  if ((${#phases[@]} == 3)); then
    printf 'gate: all phases passed\n'
  else
    printf 'gate: partial gate passed (%s)\n' "${phases[*]}"
  fi
}

cmd_alone() {
  (($# == 1)) || die "usage: $SCRIPT_NAME alone <test-file>"
  require_clone
  local file
  if [[ "$1" == /* ]]; then
    file="$(realpath -m "$1")"
  else
    file="$(realpath -m "$CLONE/$1")"
  fi
  case "$file" in
    "$CLONE"/*) ;;
    *) die "test file is outside the landing clone: $1" ;;
  esac
  [[ -f "$file" ]] || die "test file not found: $1"
  local relative="${file#"$CLONE"/}"
  local rc=0
  if run_phase "alone:$relative" pnpm exec vitest run "$relative"; then
    printf 'alone: passed\n'
  else
    rc=$?
    printf 'alone: FAILED (exit %d)\n' "$rc" >&2
    return "$rc"
  fi
}

cmd_bundle() {
  (($# <= 1)) || die "usage: $SCRIPT_NAME bundle [path]"
  require_clone
  local bundle="${1:-${WSL_GATE_BUNDLE:-$HOME/wsl-gate/landing.bundle}}"
  bundle="$(realpath -m "$bundle")"
  case "$bundle" in
    "$CLONE"/*) die "bundle path must be outside the landing clone: $bundle" ;;
  esac
  mkdir -p "$(dirname "$bundle")"

  printf 'bundle: %s at %s -> %s\n' \
    "$CLONE" "$(git -C "$CLONE" rev-parse --short dev/lxy)" "$bundle"
  ( cd "$CLONE" && git bundle create "$bundle" dev/lxy )
  ( cd "$CLONE" && git bundle verify "$bundle" )
  ( cd "$CLONE" && git bundle list-heads "$bundle" )
  sha256sum "$bundle"
  printf 'bundle: %s bytes\n' "$(stat -c '%s' "$bundle")"
}

main() {
  case "${1:-}" in
    help | -h | --help)
      usage
      exit 0
      ;;
  esac
  setup_toolchain
  case "${1:-}" in
    prepare)
      shift
      cmd_prepare "$@"
      ;;
    gate)
      shift
      cmd_gate "$@"
      ;;
    alone)
      shift
      cmd_alone "$@"
      ;;
    bundle)
      shift
      cmd_bundle "$@"
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
}

main "$@"
