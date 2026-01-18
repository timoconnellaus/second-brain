#!/bin/bash

# Sync Cloudflare Agents SDK documentation from GitHub
# Usage: ./scripts/sync-agents-docs.sh

set -e

REPO="cloudflare/agents"
BRANCH="main"
DOCS_PATH="docs"
OUTPUT_DIR="docs/agents-sdk"

echo "Syncing Cloudflare Agents SDK docs..."

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Get list of files in the docs folder using GitHub API
FILES=$(curl -s "https://api.github.com/repos/$REPO/contents/$DOCS_PATH?ref=$BRANCH" | \
  grep '"download_url"' | \
  sed 's/.*"download_url": "\([^"]*\)".*/\1/' | \
  grep -v "null")

# Download each file
for URL in $FILES; do
  FILENAME=$(basename "$URL")
  echo "  Downloading $FILENAME..."
  curl -sL "$URL" -o "$OUTPUT_DIR/$FILENAME"
done

# Also check for subdirectories
ITEMS=$(curl -s "https://api.github.com/repos/$REPO/contents/$DOCS_PATH?ref=$BRANCH")

# Get directories
DIRS=$(echo "$ITEMS" | grep -B2 '"type": "dir"' | grep '"name"' | sed 's/.*"name": "\([^"]*\)".*/\1/' || true)

for DIR in $DIRS; do
  echo "  Processing subdirectory: $DIR"
  mkdir -p "$OUTPUT_DIR/$DIR"

  SUBFILES=$(curl -s "https://api.github.com/repos/$REPO/contents/$DOCS_PATH/$DIR?ref=$BRANCH" | \
    grep '"download_url"' | \
    sed 's/.*"download_url": "\([^"]*\)".*/\1/' | \
    grep -v "null")

  for URL in $SUBFILES; do
    FILENAME=$(basename "$URL")
    echo "    Downloading $DIR/$FILENAME..."
    curl -sL "$URL" -o "$OUTPUT_DIR/$DIR/$FILENAME"
  done
done

echo ""
echo "Done! Docs synced to $OUTPUT_DIR/"
ls -la "$OUTPUT_DIR"
