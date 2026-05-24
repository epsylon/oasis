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
SSB_DIR="$HOME/.ssb"
SSB_BACKUP=""
ASSUME_YES=0
RESTORE=0
SKIP_ISOLATION=0
CLEAN_ALL=0
SEED=0
DUMMY_ONLY=0

for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=1 ;;
    --restore) RESTORE=1 ;;
    --no-isolation) SKIP_ISOLATION=1 ;;
    --seed) SEED=1 ;;
    dummy|--dummy) SEED=1; DUMMY_ONLY=1 ;;
    clean-all|--clean-all) CLEAN_ALL=1 ;;
    -h|--help)
      cat <<EOF
Usage: $0 [options]

Options:
  -y, --yes         skip confirmation prompt
  --restore         restore your original ~/.ssb on exit (DESTROYS test data)
                    Default: keep the test ~/.ssb so you can boot oasis and
                    visually inspect what the tests produced.
  --no-isolation    run tests against current ~/.ssb (DANGEROUS — may conflict)
  --seed            after all mock tests pass, write dummy content to the
                    isolated ~/.ssb via the REAL SSB models (so you can boot
                    oasis and visually inspect modules with realistic data).
  dummy             skip tests AND isolation; publish real content into your
                    running oasis (~/.ssb) so the network gets filled with
                    dummy data you can immediately see in the browser. Requires
                    oasis to be running (sh oasis.sh) in another terminal.
  clean-all         delete all test reports in results/ AND the test ~/.ssb,
                    then exit (does NOT run tests). If a backup exists, it is
                    restored first so you don't lose your real data.
  -h, --help        this message

Each run generates test/results/unit_test_<timestamp>.md
EOF
      exit 0
      ;;
  esac
done

if [ "$CLEAN_ALL" = "1" ]; then
  echo "${YELLOW}${BOLD}clean-all:${RESET}"
  latest_backup=$(ls -dt "$HOME"/.ssb-bak-* 2>/dev/null | head -1)
  if [ -n "$latest_backup" ] && [ -d "$SSB_DIR" ]; then
    echo "  found backup: $latest_backup"
    if [ "$ASSUME_YES" != "1" ]; then
      if [ ! -t 0 ]; then
        echo "${RED}stdin is not a TTY; refusing to prompt. Pass --yes to skip prompt.${RESET}"
        exit 2
      fi
      read -r -p "  remove test ~/.ssb and restore your original from latest backup? [y/N] " ans
      case "$ans" in
        y|Y|yes|YES) ;;
        *) echo "  aborted."; exit 1 ;;
      esac
    fi
    rm -rf "$SSB_DIR"
    mv "$latest_backup" "$SSB_DIR" && echo "  ${GREEN}~/.ssb restored from $latest_backup${RESET}"
  elif [ -n "$latest_backup" ] && [ ! -d "$SSB_DIR" ]; then
    mv "$latest_backup" "$SSB_DIR" && echo "  ${GREEN}~/.ssb restored from $latest_backup${RESET}"
  elif [ -d "$SSB_DIR" ]; then
    if [ "$ASSUME_YES" != "1" ]; then
      if [ ! -t 0 ]; then
        echo "${RED}stdin is not a TTY; refusing to prompt. Pass --yes to skip prompt.${RESET}"
        exit 2
      fi
      read -r -p "  no backup found. Delete current ~/.ssb anyway? [y/N] " ans
      case "$ans" in
        y|Y|yes|YES) rm -rf "$SSB_DIR" && echo "  ${GREEN}~/.ssb deleted.${RESET}" ;;
        *) echo "  ~/.ssb left intact." ;;
      esac
    else
      rm -rf "$SSB_DIR" && echo "  ${GREEN}~/.ssb deleted.${RESET}"
    fi
  else
    echo "  no ~/.ssb to clean."
  fi
  bak_count=$(ls -d "$HOME"/.ssb-bak-* 2>/dev/null | wc -l)
  if [ "$bak_count" -gt 0 ]; then
    for b in "$HOME"/.ssb-bak-*; do
      [ -e "$b" ] && rm -rf "$b" && echo "  removed: $b"
    done
  fi
  if [ -d "test/results" ]; then
    n=$(ls test/results/unit_test_*.md 2>/dev/null | wc -l)
    rm -f test/results/unit_test_*.md
    echo "  ${GREEN}removed $n report(s) from test/results/${RESET}"
  fi
  echo "${GREEN}clean-all done.${RESET}"
  exit 0
fi

isolate_ssb() {
  if [ "$SKIP_ISOLATION" = "1" ]; then
    echo "${YELLOW}⚠ skipping ~/.ssb isolation (--no-isolation set). Tests may conflict with running oasis.${RESET}"
    return
  fi
  if [ ! -e "$SSB_DIR" ] && [ ! -L "$SSB_DIR" ]; then
    return
  fi
  local ts=$(date +%Y%m%d_%H%M%S)
  SSB_BACKUP="${SSB_DIR}-bak-${ts}"
  echo ""
  echo "${YELLOW}${BOLD}⚠  WARNING${RESET}"
  echo "${YELLOW}This will move your current ${BOLD}${SSB_DIR}${RESET}${YELLOW} → ${BOLD}${SSB_BACKUP}${RESET}"
  echo "${YELLOW}and create a fresh empty ${SSB_DIR} for the tests.${RESET}"
  echo "${YELLOW}On exit the test ~/.ssb is KEPT (visual inspection); your original stays at the backup path.${RESET}"
  echo "${YELLOW}If oasis is currently running, STOP IT FIRST.${RESET}"
  if [ "$ASSUME_YES" != "1" ]; then
    if [ ! -t 0 ]; then
      echo "${RED}stdin is not a TTY; refusing to prompt. Pass --yes to skip prompt.${RESET}"
      exit 2
    fi
    read -r -p "Continue? [y/N] " ans
    case "$ans" in
      y|Y|yes|YES) ;;
      *) echo "aborted."; exit 1 ;;
    esac
  fi
  mv "$SSB_DIR" "$SSB_BACKUP" || { echo "${RED}failed to move $SSB_DIR${RESET}"; exit 3; }
  mkdir -p "$SSB_DIR"
  echo "${GREEN}~/.ssb isolated → $SSB_BACKUP${RESET}"
}

restore_ssb() {
  if [ -z "$SSB_BACKUP" ]; then return; fi
  if [ "$RESTORE" != "1" ]; then
    echo ""
    echo "${YELLOW}Test ~/.ssb left in place for visual inspection.${RESET}"
    echo "${YELLOW}  test data:          $SSB_DIR${RESET}"
    echo "${YELLOW}  your original:      $SSB_BACKUP${RESET}"
    echo ""
    echo "${YELLOW}To boot oasis against the test data:${RESET}  sh oasis.sh"
    echo "${YELLOW}To restore your original later:${RESET}      rm -rf $SSB_DIR && mv $SSB_BACKUP $SSB_DIR"
    return
  fi
  echo ""
  echo "${YELLOW}Restoring ~/.ssb from backup...${RESET}"
  rm -rf "$SSB_DIR" 2>/dev/null
  mv "$SSB_BACKUP" "$SSB_DIR" && echo "${GREEN}~/.ssb restored.${RESET}" || echo "${RED}failed to restore — backup left at $SSB_BACKUP${RESET}"
}

trap restore_ssb EXIT INT TERM

if [ "$DUMMY_ONLY" = "1" ]; then
  echo "${YELLOW}=== dummy mode: publishing real content to your running oasis (no isolation, no tests) ===${RESET}"
  echo "${YELLOW}Make sure oasis is currently running (sh oasis.sh) so the seed can connect via the local SSB socket.${RESET}"
  node test/seed.js
  rc=$?
  if [ "$rc" -eq 0 ]; then
    echo ""
    echo "${GREEN}Done. Refresh oasis in your browser to see the seeded content.${RESET}"
  else
    echo "${RED}seed.js exited with code $rc${RESET}"
  fi
  exit "$rc"
fi

isolate_ssb

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
  mods/peers
  mods/multiuser
  mods/larp
  mods/melody
)

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
  echo "${YELLOW}=== Seeding dummy content into the test ~/.ssb ===${RESET}"
  node test/seed.js
fi

if [ "$total_failed" -gt 0 ]; then exit 1; fi
exit 0
