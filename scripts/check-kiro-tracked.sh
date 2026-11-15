#!/usr/bin/env bash
# Fail if git ignores .kiro/ or anything under it.
#
# The .kiro/ folder (specs, steering, hooks) must stay in the repo. This
# script asks git which ignore rule, if any, matches each of:
#   .kiro  .kiro/  .kiro/.probe  and every file under .kiro/
# The probe path catches rules that would ignore files added later, and it
# works even when .kiro/ is empty or missing. --no-index makes git report
# matching rules for files that are already tracked too.
#
# Usage: scripts/check-kiro-tracked.sh   (from anywhere inside the repo)
#
# Exit status:
#   0  nothing under .kiro/ is ignored
#   1  something is ignored; each hit is printed as
#      "<source>:<line>:<pattern>  <path>"
#   2  the check could not run (not a git repo, git error, unreadable files)
set -euo pipefail

prog="check-kiro-tracked"

die() {
  echo "$prog: error: $*" >&2
  exit 2
}

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" ||
  die "not inside a git work tree; run this from the repository"
cd "$repo_root"

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/$prog.XXXXXX")" ||
  die "cannot create a temporary directory"
trap 'rm -rf "$work_dir"' EXIT
paths_file="$work_dir/paths"
hits_file="$work_dir/hits"

# NUL-separated list of paths to check, so any file name works.
{
  printf '%s\0' .kiro .kiro/ .kiro/.probe
  if [[ -d .kiro ]]; then
    find .kiro ! -type d -print0
  fi
} >"$paths_file" || die "cannot list the files under .kiro/"

# git check-ignore exit status: 0 = some path matched a rule, 1 = no path
# matched, anything else = git failed.
git_status=0
git check-ignore --no-index --verbose -z --stdin \
  <"$paths_file" >"$hits_file" || git_status=$?
if [[ $git_status -ne 0 && $git_status -ne 1 ]]; then
  die "git check-ignore failed with exit status $git_status"
fi

# With -z and --verbose, git prints four NUL-terminated fields per matched
# path: source, line number, pattern, path. A pattern that starts with '!'
# is a negation rule: the path matched it and is NOT ignored, so skip it.
hits=0
while IFS= read -r -d '' src &&
  IFS= read -r -d '' line &&
  IFS= read -r -d '' pattern &&
  IFS= read -r -d '' path; do
  if [[ $pattern == '!'* ]]; then
    continue
  fi
  printf '%s:%s:%s  %s\n' "$src" "$line" "$pattern" "$path"
  hits=$((hits + 1))
done <"$hits_file"

if [[ $hits -gt 0 ]]; then
  if [[ $hits -eq 1 ]]; then
    noun="path"
  else
    noun="paths"
  fi
  echo "$prog: FAIL: git ignores $hits $noun under .kiro/. Change the rule(s) above so .kiro/ stays tracked."
  exit 1
fi

echo "$prog: OK: nothing under .kiro/ is ignored."
