# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered "Second Brain" system that captures thoughts via Slack, classifies them using AI, and stores them in Notion. See `SECOND_BRAIN_DESIGN.md` for the full system design.

Built with Cloudflare Workers and the Agents SDK. Currently a starter template—implementation in progress.

## Commands

- `bun dev` - Start local development server at http://localhost:8787/
- `bun test` - Run tests with Vitest
- `bun run deploy` - Deploy to Cloudflare Workers
- `bun run cf-typegen` - Regenerate TypeScript types after modifying wrangler.jsonc bindings
- `bun run setup-notion` - Create/update Notion databases from schema (requires NOTION_TOKEN, NOTION_PARENT_PAGE_ID for creation)

## Architecture

**Entry Point**: `src/index.ts` exports a default object with an async `fetch(request, env, ctx)` handler implementing `ExportedHandler<Env>`.

**Configuration**: `wrangler.jsonc` manages Worker settings including bindings (D1, KV, AI, etc.), environment variables, and assets.

**Type Definitions**: `worker-configuration.d.ts` is auto-generated from wrangler.jsonc - do not edit manually.

## Testing

Tests use Vitest with `@cloudflare/vitest-pool-workers` for native Workers runtime testing.

Two patterns in `test/index.spec.ts`:
- **Unit tests**: Use `createExecutionContext()` for mocked context
- **Integration tests**: Use `SELF` binding to test the actual Worker

## Code Style

Prettier configured: tabs, 140 char line width, single quotes, semicolons.

## Documentation

- `SECOND_BRAIN_DESIGN.md` - System architecture, Notion schema, AI prompts, and implementation plan
- `AGENTS_SDK.md` - Quick reference for Cloudflare Agents SDK (state, scheduling, queues, WebSockets)
- `docs/agents-sdk/` - Full Agents SDK docs (run `./scripts/sync-agents-docs.sh` to update)
- `docs/workers-testing/` - Cloudflare Workers testing docs (Vitest integration, Miniflare)
