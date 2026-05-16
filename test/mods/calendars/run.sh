#!/usr/bin/env bash
export NODE_NO_WARNINGS=1
cd "$(dirname "$0")/../../.."
node test/run.js mods/calendars "$@"
