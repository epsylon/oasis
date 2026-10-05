#!/usr/bin/env bash
if [ -z "${BASH_VERSION:-}" ]; then
  echo "This script requires bash, not sh. Re-run it as:  bash $0 $*" 1>&2
  exec bash "$0" "$@"
fi
set -u
export NODE_NO_WARNINGS=1

cd "$(dirname "$0")/.."

GREEN=$'\e[32m'
RED=$'\e[31m'
YELLOW=$'\e[33m'
BOLD=$'\e[1m'
RESET=$'\e[0m'
TEST_SSB="${OASIS_TEST_SSB:-$HOME/.ssb-oasis-test}"
ASSUME_YES=0
CLEAN_ALL=0
SEED=0
DUMMY_ONLY=0

for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=1 ;;
    --seed) SEED=1 ;;
    dummy|--dummy) SEED=1; DUMMY_ONLY=1 ;;
    clean-all|--clean-all) CLEAN_ALL=1 ;;
    -h|--help)
      cat <<EOF
Usage: $0 [options]

Tests never touch your ~/.ssb: they run against their own directory,
$TEST_SSB (set OASIS_TEST_SSB to use another one).

Options:
  -y, --yes         accepted for compatibility; nothing is asked any more
  --seed            after all tests pass, fill the test directory with dummy
                    content through the real SSB models
  dummy             skip the tests and only fill a fresh test directory with
                    dummy content
  clean-all         delete the test reports and the test directory, then exit
  -h, --help        this message

To look at the test data, offline:  OASIS_NETWORK_PAUSED=1 ssb_path=$TEST_SSB sh oasis.sh

Each run generates test/results/unit_test_<timestamp>.md
EOF
      exit 0
      ;;
  esac
done

REAL_HOME="$(cd "$HOME" && pwd -P)"
REAL_TEST="$(mkdir -p "$TEST_SSB" && cd "$TEST_SSB" && pwd -P)"
case "$REAL_TEST" in
  "$REAL_HOME/.ssb"|"$REAL_HOME"|"/")
    echo "${RED}refusing to run: $TEST_SSB is not a disposable test directory${RESET}"
    exit 3
    ;;
esac

if [ "$CLEAN_ALL" = "1" ]; then
  echo "${YELLOW}${BOLD}clean-all:${RESET}"
  rm -rf "$TEST_SSB" && echo "  ${GREEN}removed $TEST_SSB${RESET}"
  if [ -d "test/results" ]; then
    n=$(ls test/results/unit_test_*.md 2>/dev/null | wc -l)
    rm -f test/results/unit_test_*.md
    echo "  ${GREEN}removed $n report(s) from test/results/${RESET}"
  fi
  for b in "$HOME"/.ssb-bak-*; do
    [ -e "$b" ] && echo "  ${YELLOW}left untouched (made by an older version of this script): $b${RESET}"
  done
  echo "${GREEN}clean-all done.${RESET}"
  exit 0
fi

rm -rf "$TEST_SSB"
mkdir -p "$TEST_SSB"
export ssb_path="$TEST_SSB"
echo "${GREEN}test directory: $TEST_SSB (your ~/.ssb is not used)${RESET}"

if [ "$DUMMY_ONLY" = "1" ]; then
  echo "${YELLOW}=== dummy mode: filling the test directory with dummy content (no tests) ===${RESET}"
  node test/seed.js
  rc=$?
  if [ "$rc" -eq 0 ]; then
    echo ""
    echo "${GREEN}Done. To see it, offline:  OASIS_NETWORK_PAUSED=1 ssb_path=$TEST_SSB sh oasis.sh${RESET}"
  else
    echo "${RED}seed.js exited with code $rc${RESET}"
  fi
  exit "$rc"
fi

MODULES=(
  mods/crypto
  mods/tribes
  mods/sub-tribes
  mods/media/audios
  mods/media/videos
  mods/media/images
  mods/media/documents
  mods/media/bookmarks
  mods/forum
  mods/transfers
  mods/votes
  mods/events
  mods/tasks
  mods/chats
  mods/pads
  mods/maps
  mods/torrents
  mods/calendars
  mods/reports
  mods/market
  mods/jobs
  mods/projects
  mods/inhabitants
  mods/parliament
  mods/courts
  mods/opinions
  mods/spread
  mods/activity
  mods/stats
  mods/blockchain
  mods/shops
  mods/pixelia
  mods/pm
  mods/feed
  mods/tags
  mods/search
  mods/trending
  mods/agenda
  mods/cv
  mods/favorites
  mods/banking
  mods/ai
  mods/profile
  mods/multiuser
  mods/larp
  mods/melody
)

while IFS= read -r discovered; do
  case " ${MODULES[*]} " in
    *" $discovered "*) ;;
    *) MODULES+=("$discovered") ;;
  esac
done < <(find test/mods -type f -name '*.test.js' -printf '%h\n' | sed 's|^test/||' | sort -u)

DATE=$(date +%Y-%m-%d_%H-%M-%S)
REPORT_DIR="test/results"
mkdir -p "$REPORT_DIR"
REPORT="$REPORT_DIR/unit_test_${DATE}.md"

TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

total_passed=0
total_failed=0
total_tests_passed=0
total_tests_run=0
failed_modules=()
passing_modules=()
module_outputs=()

for m in "${MODULES[@]}"; do
  if [ ! -d "test/$m" ]; then
    echo "${YELLOW}skip $m (no tests yet)${RESET}"
    continue
  fi
  output=$(node test/run.js "$m" 2>&1)
  echo "$output"
  echo "$output" > "$TMP/$(echo $m | tr '/' '_').out"
  summary=$(echo "$output" | grep -E "passed" | tail -1)
  if [ -z "$summary" ]; then
    total_failed=$((total_failed + 1))
    failed_modules+=("$m")
    continue
  fi
  pcount=$(echo "$summary" | sed -E 's/.*\[32m([0-9]+)\/([0-9]+) passed.*/\1/' | grep -E "^[0-9]+$" || echo 0)
  tcount=$(echo "$summary" | sed -E 's/.*\[32m([0-9]+)\/([0-9]+) passed.*/\2/' | grep -E "^[0-9]+$")
  if [ -z "$tcount" ]; then
    pcount=$(echo "$summary" | sed -E 's/.*\[3[12]m([0-9]+)\/([0-9]+) passed.*/\1/')
    tcount=$(echo "$summary" | sed -E 's/.*\[3[12]m([0-9]+)\/([0-9]+) passed.*/\2/')
  fi
  total_tests_passed=$((total_tests_passed + ${pcount:-0}))
  total_tests_run=$((total_tests_run + ${tcount:-0}))
  if echo "$summary" | grep -q "failed"; then
    total_failed=$((total_failed + 1))
    failed_modules+=("$m")
  else
    total_passed=$((total_passed + 1))
    passing_modules+=("$m")
  fi
done

echo ""
echo "${YELLOW}=== Aggregate ===${RESET}"
echo "${GREEN}Modules passing: $total_passed${RESET}"
if [ "$total_failed" -gt 0 ]; then
  echo "${RED}Modules with failures: $total_failed${RESET}"
  for f in "${failed_modules[@]}"; do echo "  - $f"; done
fi

{
  echo "# Unit test report — $DATE"
  echo ""
  echo "**Tests passed:** $total_tests_passed / $total_tests_run"
  echo "**Modules passing:** $total_passed / ${#MODULES[@]}"
  if [ "$total_failed" -gt 0 ]; then
    echo "**Modules with failures:** $total_failed"
  fi
  echo ""
  echo "## ✅ Passing modules"
  echo ""
  for m in "${passing_modules[@]}"; do
    f="$TMP/$(echo $m | tr '/' '_').out"
    if [ -f "$f" ]; then
      summary=$(grep -E "passed in" "$f" | tail -1 | sed -E 's/\x1b\[[0-9;]*m//g')
      echo "- \`$m\` — $summary"
      grep -E "✓" "$f" | sed -E 's/\x1b\[[0-9;]*m//g' | sed 's/^  /    - /'
    fi
  done
  if [ "$total_failed" -gt 0 ]; then
    echo ""
    echo "## ❌ Failing modules"
    echo ""
    for m in "${failed_modules[@]}"; do
      f="$TMP/$(echo $m | tr '/' '_').out"
      echo "### \`$m\`"
      echo ""
      if [ -f "$f" ]; then
        echo '```'
        cat "$f" | sed -E 's/\x1b\[[0-9;]*m//g'
        echo '```'
      else
        echo "_(no output captured)_"
      fi
      echo ""
    done
  fi
  echo ""
  echo "---"
  echo "_Generated by \`test/run.sh\` on $DATE._"
} > "$REPORT"

echo ""
echo "${YELLOW}Report:${RESET} $REPORT"

if [ "$SEED" = "1" ] && [ "$total_failed" -eq 0 ]; then
  echo ""
  echo "${YELLOW}=== Seeding dummy content into $TEST_SSB ===${RESET}"
  node test/seed.js
  echo "${GREEN}To see it, offline:  OASIS_NETWORK_PAUSED=1 ssb_path=$TEST_SSB sh oasis.sh${RESET}"
fi

if [ "$total_failed" -gt 0 ]; then exit 1; fi
exit 0
