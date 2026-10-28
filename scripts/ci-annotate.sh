#!/usr/bin/env bash
# Usage: scripts/ci-annotate.sh <title> <command...>
# Runs a command, keeps its normal output, and on failure publishes the important lines as ONE
# GitHub Actions error annotation (visible on the run summary page and via the public API).
set -o pipefail
title="$1"; shift
log="$(mktemp)"
"$@" 2>&1 | tee "$log"
status=${PIPESTATUS[0]}
if [ "$status" -ne 0 ]; then
  summary=$(grep -E "FAIL|Error|error:|✗|×|Expected|Received|Timed out|Cannot|Unhandled|failed" "$log" \
    | grep -vE "^\s*at |node_modules" | head -60 | cut -c1-300)
  [ -z "$summary" ] && summary=$(tail -40 "$log" | cut -c1-300)
  # Encode for workflow commands: %, CR, LF
  enc=$(printf '%s' "$summary" | sed -e 's/%/%25/g' | awk 'BEGIN{ORS="%0A"} {gsub(/\r/,"%0D"); print}')
  echo "::error title=${title} failed::${enc}"
fi
exit "$status"
