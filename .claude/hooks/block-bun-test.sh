#!/bin/bash

# Read the hook input from stdin
input=$(cat)

# Extract the command from the JSON input
command=$(echo "$input" | jq -r '.tool_input.command // empty')

# Check if the command contains "bun test"
if echo "$command" | grep -q "bun test"; then
  echo '{"decision": "block", "reason": "Use `bun run test` instead of `bun test`"}'
  exit 0
fi

# Allow all other commands
exit 0
