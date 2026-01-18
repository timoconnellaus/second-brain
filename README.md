# Second Brain

AI-powered cognitive support system that captures thoughts via Slack, classifies them using AI, and stores them in Notion.

## Features

- **Auto-classification**: AI categorizes messages into People, Projects, Ideas, or Admin
- **Voice messages**: Send voice notes in Slack - transcribed automatically via Whisper
- **Confidence scoring**: Shows AI confidence and asks for clarification when uncertain
- **Duplicate detection**: Finds similar existing entries and offers to update or create new
- **Thread corrections**: Reply to threads to update categories, fields, or add context
- **Scheduled digests**: Daily summary of actions and weekly reviews (coming soon)

## Architecture

```
Slack (#sb-inbox) → Cloudflare Workers (Durable Objects) → OpenRouter/Gemini → Notion
```

Built with:
- [Cloudflare Workers](https://developers.cloudflare.com/workers/) + [Agents SDK](https://developers.cloudflare.com/agents/)
- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) (Whisper for voice transcription)
- [OpenRouter](https://openrouter.ai/) (Gemini 3.0 Flash for classification)
- [Notion API](https://developers.notion.com/)
- [Slack Events API](https://api.slack.com/events-api)

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) runtime
- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Slack app](https://api.slack.com/apps) with bot token and signing secret
- [Notion integration](https://www.notion.so/my-integrations)
- [OpenRouter API key](https://openrouter.ai/keys)

### Installation

```bash
# Clone the repo
git clone https://github.com/yourusername/second-brain.git
cd second-brain

# Install dependencies
bun install

# Copy environment template
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your values
```

### Local Development

```bash
bun dev
```

This starts a local server at http://localhost:8787/. Use a tool like [ngrok](https://ngrok.com/) to expose it for Slack webhooks during development.

## Environment Variables

| Variable | Description | Secret? |
|----------|-------------|---------|
| `NOTION_TOKEN` | Notion integration token | Yes |
| `OPENROUTER_API_KEY` | OpenRouter API key | Yes |
| `SLACK_BOT_TOKEN` | Slack bot OAuth token | Yes |
| `SLACK_SIGNING_SECRET` | Slack request signing secret | Yes |
| `SLACK_USER_ID` | Your Slack user ID (for DMs) | No |
| `NOTION_DB_PEOPLE` | People database ID | No |
| `NOTION_DB_PROJECTS` | Projects database ID | No |
| `NOTION_DB_IDEAS` | Ideas database ID | No |
| `NOTION_DB_ADMIN` | Admin database ID | No |
| `NOTION_DB_INBOX_LOG` | Inbox Log database ID | No |

For setup scripts only:
| `NOTION_PARENT_PAGE_ID` | Parent page for creating databases | No |

## Deployment

### 1. Login to Cloudflare

```bash
wrangler login
```

Or set `CLOUDFLARE_ACCOUNT_ID` environment variable.

### 2. Set Secrets

```bash
wrangler secret put NOTION_TOKEN
wrangler secret put OPENROUTER_API_KEY
wrangler secret put SLACK_BOT_TOKEN
wrangler secret put SLACK_SIGNING_SECRET
```

### 3. Set Configuration Variables

Add to `wrangler.jsonc`:

```jsonc
{
  "vars": {
    "SLACK_USER_ID": "U_your_user_id",
    "NOTION_DB_PEOPLE": "your_database_id",
    "NOTION_DB_PROJECTS": "your_database_id",
    "NOTION_DB_IDEAS": "your_database_id",
    "NOTION_DB_ADMIN": "your_database_id",
    "NOTION_DB_INBOX_LOG": "your_database_id"
  }
}
```

Or use `wrangler secret put` for each.

### 4. Deploy

```bash
bun run deploy
```

### 5. Configure Slack App

Set these URLs in your Slack app settings:

- **Event Subscriptions Request URL**: `https://second-brain.<your-subdomain>.workers.dev/slack/events`
- **Interactivity Request URL**: `https://second-brain.<your-subdomain>.workers.dev/slack/interactions`

Subscribe to these bot events:
- `message.channels` - Messages in public channels
- `message.groups` - Messages in private channels

Required bot token scopes:
- `chat:write` - Post messages
- `reactions:write` - Add reactions
- `files:read` - Download voice messages for transcription

## Notion Setup

To create the required Notion databases:

```bash
bun run setup-notion
```

This creates 5 databases under your specified parent page:
- **People**: Contacts with context and follow-ups
- **Projects**: Tasks with status and next actions
- **Ideas**: Concepts with summaries
- **Admin**: Administrative tasks with due dates
- **Inbox Log**: Audit trail of all captures

Alternatively, create these databases manually following the schema in `SECOND_BRAIN_DESIGN.md`.

## Usage

1. Create a Slack channel called `#sb-inbox` (or configure your preferred channel)
2. Invite your bot to the channel
3. Post messages or voice notes like:
   - "Remember to follow up with Sarah about the design review"
   - "Project idea: build a CLI tool for managing dotfiles"
   - "Pay electricity bill by Friday"

The bot will classify (transcribing voice messages first), store in Notion, and reply with confirmation.

## Commands

| Command | Description |
|---------|-------------|
| `bun dev` | Start local development server |
| `bun test` | Run tests with Vitest |
| `bun run deploy` | Deploy to Cloudflare Workers |
| `bun run cf-typegen` | Regenerate TypeScript types from wrangler.jsonc |
| `bun run setup-notion` | Create Notion databases from schema |

## Documentation

- [SECOND_BRAIN_DESIGN.md](./SECOND_BRAIN_DESIGN.md) - Full system design, Notion schema, and AI prompts
- [AGENTS_SDK.md](./AGENTS_SDK.md) - Quick reference for Cloudflare Agents SDK
- [docs/agents-sdk/](./docs/agents-sdk/) - Full Agents SDK documentation

## License

MIT
