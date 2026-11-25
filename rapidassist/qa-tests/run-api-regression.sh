#!/usr/bin/env bash
# Fresh isolated stack -> full API suite -> regression check against results/api-baseline.json -> stop stack.
set -u
cd "$(dirname "$0")"
node lib/start-stack.js > results/stack.log 2>&1 &
STACK=$!
trap 'kill -INT $STACK 2>/dev/null; wait $STACK 2>/dev/null' EXIT
for _ in $(seq 1 60); do [ -f .stack.json ] && break; sleep 1; done
[ -f .stack.json ] || { echo "stack failed to start"; cat results/stack.log; exit 1; }
node api/run-api-tests.js > results/api-run.log 2>&1
grep -E "^✘" results/api-run.log
tail -1 results/api-run.log
node lib/compare.js results/api-baseline.json results/api-results.json
