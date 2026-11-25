#!/usr/bin/env bash
# Fresh isolated stack -> Expo Web walkthrough -> stop stack. Expo Web must already be running on :8081
# (restart it after app code changes: with CI=1 Metro does not watch files).
set -u
cd "$(dirname "$0")"
node lib/start-stack.js > results/stack.log 2>&1 &
STACK=$!
trap 'kill -INT $STACK 2>/dev/null; wait $STACK 2>/dev/null' EXIT
for _ in $(seq 1 60); do [ -f .stack.json ] && break; sleep 1; done
for _ in $(seq 1 90); do curl -s -o /dev/null -m 2 http://localhost:8081/ && break; sleep 2; done
APP_API_ORIGIN=${APP_API_ORIGIN:-http://192.168.0.116:4001} node ui/mobile-web.e2e.js > results/mobile-run.log 2>&1
grep -E "^✘" results/mobile-run.log | cut -c1-260
tail -1 results/mobile-run.log
