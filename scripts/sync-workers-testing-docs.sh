#!/bin/bash

# Sync Cloudflare Workers Testing documentation from GitHub
# Usage: ./scripts/sync-workers-testing-docs.sh

set -e

REPO="cloudflare/cloudflare-docs"
BRANCH="production"
DOCS_PATH="src/content/docs/workers/testing"
OUTPUT_DIR="docs/workers-testing"

echo "Syncing Cloudflare Workers Testing docs..."

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Function to download directory contents recursively
download_dir() {
  local path=$1
  local output=$2

  mkdir -p "$output"

  # Get directory contents
  local contents=$(curl -s "https://api.github.com/repos/$REPO/contents/$path?ref=$BRANCH")

  # Process each item
  echo "$contents" | grep -o '{[^}]*}' | while read -r item; do
    local name=$(echo "$item" | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
    local type=$(echo "$item" | grep -o '"type":"[^"]*"' | cut -d'"' -f4)
    local download_url=$(echo "$item" | grep -o '"download_url":"[^"]*"' | cut -d'"' -f4)

    if [ "$type" = "file" ] && [ -n "$download_url" ] && [ "$download_url" != "null" ]; then
      echo "  Downloading $name..."
      curl -sL "$download_url" -o "$output/$name"
    elif [ "$type" = "dir" ]; then
      echo "  Processing directory: $name"
      download_dir "$path/$name" "$output/$name"
    fi
  done
}

# Download main directory
download_dir "$DOCS_PATH" "$OUTPUT_DIR"

echo ""
echo "Done! Docs synced to $OUTPUT_DIR/"
find "$OUTPUT_DIR" -type f -name "*.mdx" -o -name "*.md" | head -20
