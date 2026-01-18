# Second Brain System Design

An AI-powered cognitive support system that captures thoughts via Slack, classifies them using AI, stores them in Notion, and proactively surfaces relevant information through daily and weekly digests.

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Capture | Slack (`#sb-inbox` channel) | Frictionless input - one thought per message |
| Processing | Cloudflare Agents SDK | Persistent state, webhooks, scheduled tasks |
| Intelligence | OpenRouter + Gemini 3.0 Flash | Classification and summarization |
| Storage | Notion (5 databases) | Structured memory with human-readable UI |
| Delivery | Slack (threads + DMs) | Confirmations and digests |

## System Architecture

```
┌─────────────────────┐
│       SLACK         │
│                     │
│  #sb-inbox ─────────┼──────┐
│  (capture)          │      │
│                     │      ▼
│  Thread replies ◀───┼─── ┌─────────────────────────────────────────┐
│  (confirmations)    │    │         CLOUDFLARE AGENT                │
│                     │    │                                         │
│  DMs ◀──────────────┼─── │  SecondBrainAgent                       │
│  (digests)          │    │  ├─ onSlackEvent()     → classify       │
└─────────────────────┘    │  ├─ onThreadReply()    → correct/update │
                           │  ├─ dailyDigest()      → 6am alarm      │
                           │  └─ weeklyReview()     → Sun 4pm alarm  │
                           │                                         │
                           │  Durable Object State:                  │
                           │  - Thread conversation context          │
                           │  - Pending corrections                  │
                           └────────────────┬────────────────────────┘
                                            │
                                            ▼
                           ┌─────────────────────────────────────────┐
                           │              NOTION                     │
                           │                                         │
                           │  ┌──────────┐ ┌──────────┐ ┌─────────┐ │
                           │  │  People  │ │ Projects │ │  Ideas  │ │
                           │  └──────────┘ └──────────┘ └─────────┘ │
                           │  ┌──────────┐ ┌───────────────────────┐│
                           │  │  Admin   │ │      Inbox Log        ││
                           │  └──────────┘ └───────────────────────┘│
                           └─────────────────────────────────────────┘
```

## Core Loop

```
1. You have a thought
   ↓
2. Post to #sb-inbox: "Had coffee with Sarah - she's looking for a frontend dev"
   ↓
3. Agent receives Slack webhook
   ↓
4. Agent calls OpenRouter (Gemini 3.0 Flash) with classification prompt
   ↓
5. AI returns: { category: "person", confidence: 0.91, name: "Sarah", ... }
   ↓
6. Confidence 0.91 >= 0.6? YES
   ↓
7. Agent creates record in Notion "People" database
   ↓
8. Agent logs to "Inbox Log" for audit trail
   ↓
9. Agent replies in Slack thread: "Filed as Person: Sarah | Confidence: 0.91"
   ↓
10. You move on (thought is now safe)
```

## Notion Database Schema

### People
| Field | Type | Description |
|-------|------|-------------|
| Name | Title | Person's name |
| Context | Text | How you know them, where you met |
| Follow-ups | Text | Things to remember for next conversation |
| Last Touched | Date | Auto-updated on each interaction |
| Tags | Multi-select | Categories (work, personal, etc.) |

### Projects
| Field | Type | Description |
|-------|------|-------------|
| Name | Title | Project name |
| Next Action | Text | Specific, executable next step |
| Notes | Text | Additional context |
| Status | Select | active, waiting, blocked, someday, done |

### Ideas
| Field | Type | Description |
|-------|------|-------------|
| Name | Title | Idea title |
| One-liner | Text | Core insight in one sentence |
| Notes | Text | Elaboration and details |
| Tags | Multi-select | Categories |

### Admin
| Field | Type | Description |
|-------|------|-------------|
| Name | Title | Task name |
| Due Date | Date | When it needs to be done |
| Status | Select | pending, done |

### Inbox Log (Audit Trail)
| Field | Type | Description |
|-------|------|-------------|
| Record Name | Title | What was filed |
| Captured Text | Text | Original message from Slack |
| Confidence | Number | AI confidence score (0-1) |
| Created | Date | Timestamp |
| Destination | Select | people, projects, ideas, admin, needs_review |

## AI Classification

### Model
- **Provider**: OpenRouter
- **Model**: `google/gemini-2.0-flash-001` (Gemini 3.0 Flash)
- **Why**: Fast, cheap, good at structured output

### Classification Prompt

```
You are a classifier for a personal knowledge system. Your job is to categorize thoughts and extract structured data.

## Categories

- **person**: Information about a specific individual
  Extract: name, context (how they know them), follow_ups (things to remember)

- **project**: A project or task with actionable steps
  Extract: name, next_action (specific executable task), notes, status (default: active)

- **idea**: A concept, insight, or creative thought
  Extract: name (title), one_liner (core insight), notes

- **admin**: Administrative task with a deadline
  Extract: name, due_date (ISO format or null), status (default: pending)

## Rules

1. Choose exactly ONE category
2. If genuinely ambiguous, choose "admin" with lower confidence
3. Extract as much structured data as possible
4. For "next_action", make it specific and executable (not "work on X" but "email Y about Z")

## Output Format

Return ONLY valid JSON, no markdown, no explanation:

{
  "category": "person" | "project" | "idea" | "admin",
  "confidence": <number 0.0-1.0>,
  "name": "<extracted title or name>",
  "fields": {
    // category-specific fields
  }
}

## Input

Classify this thought:

{message_text}
```

### Confidence Threshold

- **>= 0.6**: Auto-file to appropriate database
- **< 0.6**: Log to Inbox Log with `needs_review` status, ask for clarification in thread

## Thread Handling

When you reply in a thread, the agent understands context:

**Corrections:**
```
You: "Actually that should be a project, not a person"
Agent: "Got it. Moved to Projects. What's the next action?"
```

**Clarifications:**
```
Agent: "I'm not sure where this goes. Is this about a person, project, idea, or admin task?"
You: "It's a project about the website redesign"
Agent: "Filed as Project: Website Redesign | What's the next action?"
```

**Updates:**
```
You: "Add to Sarah's follow-ups: Ask about the React conference"
Agent: "Updated Sarah's follow-ups"
```

## Scheduled Digests

### Daily Digest (6:00 AM)

Delivered via Slack DM. Target: <150 words, 2-minute read.

**Content:**
- Top 3 actions for today (from Projects with status=active)
- 1 thing you might be stuck on (oldest active project)
- 1 person you haven't touched in 30+ days (optional)

**Prompt:**
```
Generate a brief daily digest from this data. Be concise (<150 words).
Focus on what's actionable TODAY. Use bullet points.

Active Projects: {projects}
People needing attention: {stale_people}
Recent captures: {recent_inbox}
```

### Weekly Review (Sunday 4:00 PM)

Delivered via Slack DM. Target: <250 words.

**Content:**
- What happened this week (new entries by category)
- Biggest open loops (projects without recent activity)
- 3 suggested actions for next week
- 1 pattern the system noticed

**Prompt:**
```
Generate a weekly review from this data. Be concise (<250 words).
Help the user see patterns and prioritize.

This week's captures: {weekly_entries}
All active projects: {projects}
Stale items: {stale_items}
```

## Eight Building Blocks (from SECOND_BRAIN.md)

| # | Block | Implementation |
|---|-------|----------------|
| 1 | Drop Box | Slack `#sb-inbox` channel |
| 2 | Sorter | OpenRouter + Gemini classification |
| 3 | Form | Notion database schemas |
| 4 | Filing Cabinet | Notion databases |
| 5 | Receipt | Inbox Log database |
| 6 | Bouncer | 0.6 confidence threshold |
| 7 | Tap on Shoulder | Scheduled alarms → Slack DMs |
| 8 | Fix Button | Thread replies with natural language |

## Cloudflare Agent Structure

```typescript
// src/agent.ts
import { Agent } from '@cloudflare/agents';

export class SecondBrainAgent extends Agent {
  // Handle incoming Slack events
  async onSlackEvent(event: SlackMessageEvent) {
    // 1. Verify Slack signature
    // 2. Extract message text
    // 3. Classify via OpenRouter
    // 4. Route to appropriate Notion database
    // 5. Log to Inbox Log
    // 6. Reply in thread
  }

  // Handle thread replies (corrections/clarifications)
  async onThreadReply(event: SlackMessageEvent) {
    // 1. Get conversation context from state
    // 2. Understand intent (correct, clarify, update)
    // 3. Apply changes to Notion
    // 4. Confirm in thread
  }

  // Daily digest alarm (6am)
  async dailyDigest() {
    // 1. Query active projects
    // 2. Query people needing attention
    // 3. Generate digest via OpenRouter
    // 4. Send DM to user
  }

  // Weekly review alarm (Sunday 4pm)
  async weeklyReview() {
    // 1. Query past 7 days of entries
    // 2. Query all active projects
    // 3. Generate review via OpenRouter
    // 4. Send DM to user
  }
}
```

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/slack/events` | POST | Receive Slack event webhooks |
| `/health` | GET | Health check for monitoring |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NOTION_TOKEN` | Notion integration secret |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `SLACK_BOT_TOKEN` | Slack bot OAuth token |
| `SLACK_SIGNING_SECRET` | For verifying Slack requests |
| `SLACK_USER_ID` | Your Slack user ID (for DMs) |
| `NOTION_DB_PEOPLE` | People database ID |
| `NOTION_DB_PROJECTS` | Projects database ID |
| `NOTION_DB_IDEAS` | Ideas database ID |
| `NOTION_DB_ADMIN` | Admin database ID |
| `NOTION_DB_INBOX_LOG` | Inbox Log database ID |

## Slack App Setup Checklist

- [x] Create app at api.slack.com/apps
- [x] Add Bot Token Scopes: `channels:history`, `channels:read`, `chat:write`, `im:write`, `users:read`
- [x] Install to workspace
- [x] Get Bot User OAuth Token
- [ ] Enable Event Subscriptions (need Worker URL first)
- [ ] Subscribe to `message.channels` event
- [ ] Add bot to #sb-inbox channel

## Design Principles

1. **One reliable human behavior**: You only capture to Slack. Everything else is automated.

2. **Separate concerns**: Slack (interface) → Cloudflare (compute) → Notion (storage)

3. **Prompts as APIs**: Fixed input format, fixed output format, no surprises.

4. **Trust through visibility**: Inbox Log shows everything. Confidence scores are visible. Corrections are trivial.

5. **Safe defaults**: When uncertain, don't auto-file. Ask instead.

6. **Small outputs**: Daily digest <150 words. Weekly review <250 words.

7. **Next action as unit**: Projects must have specific, executable next actions.

8. **Design for restart**: Fall off for a week? No problem. Brain dump and resume.

## Future Enhancements (Not MVP)

- Voice capture via Slack voice messages
- Email forwarding integration
- Calendar integration for meeting prep
- Birthday/anniversary reminders
- Recurring task automation
- Mobile shortcut for quick capture
