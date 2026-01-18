# Second Brain System Architecture

## Overview

A second brain system is an AI-powered cognitive support structure that actively works on captured information while you focus on other tasks. Unlike traditional passive storage systems (Notion, Obsidian, Evernote), a second brain implements an automated feedback loop that classifies, routes, summarizes, and surfaces information—all without requiring you to remember to organize or retrieve it.

The key difference: **passive storage vs. active systems**. Your brain was designed to think, not store. A second brain removes the storage burden and replaces it with intelligent automation.

## Technology Stack

Non-engineers can build this system with four tools (all accessible within 10 minutes):

1. **Slack** - Capture interface (frictionless input)
2. **Notion** - Memory/storage layer (structured database)
3. **Zapier** (or Make) - Automation/orchestration layer
4. **Claude or ChatGPT** - Intelligence layer (classification & summarization)

### Why These Tools?

- **Slack**: Low-friction capture. Everyone uses it. One action per thought.
- **Notion**: Visual, human-readable, API-accessible, reliable automation target
- **Zapier**: Connects tools, triggers workflows, makes API calls reliable
- **Claude/ChatGPT**: Classifies thoughts, extracts details, returns structured JSON

## Eight Building Blocks

Every reliable second brain system contains these eight components:

### 1. The Drop Box (Frictionless Capture)
**Engineering term**: Capture door / Ingress point

- Single channel: `#SB Inbox` (private Slack channel)
- One action: Type one thought per message
- Zero decisions: No organizing, tagging, or naming required
- Critical constraint: Capturing must take <2 seconds or you won't use it consistently

**Why it matters**: Systems fail when capture requires decisions. The Dropbox removes all friction.

### 2. The Sorter (AI Classification)
**Engineering term**: Classifier / Router

- Receives raw thoughts from Slack
- Classifies into buckets: Person, Project, Idea, or Admin
- Removes the "blank canvas problem" that kills most systems
- Uses Zapier → Claude/ChatGPT with structured classification prompt
- Returns JSON with classification, extracted details, and confidence score

**Why it matters**: Humans hate taxonomy work at capture time. AI does it reliably, every time.

### 3. The Form (Schema & Data Structure)
**Engineering term**: Schema / Data contract

Defines consistent fields for each entity type:

**People Database Fields:**
- Name
- Context (how you know them)
- Follow-ups (things to remember for next conversation)
- Last touched (timestamp)
- Tags

**Projects Database Fields:**
- Name
- Status (active, waiting, blocked, someday, done)
- Next action (specific, executable task)
- Notes

**Ideas Database Fields:**
- Title
- One-liner (core insight)
- Notes/elaboration
- Tags

**Admin Database Fields:**
- Name
- Due date
- Status
- Notes

**Why it matters**: Without consistent structure, you get messy notes that can't be reliably queried, summarized, or surfaced. The form enables the entire automation flywheel.

### 4. The Filing Cabinet (Memory Store)
**Engineering term**: Memory store / Source of truth

- **Tool**: Notion databases (people, projects, ideas, admin)
- **Requirements**:
  - Writable by automation (Zapier)
  - Readable by humans (beautiful UI)
  - Supports filters and views
  - Has reliable API access
- **Critical property**: Visual, non-destructive editing. When things go wrong, you can see it and fix it.

**Why it matters**: This is where your actual facts live. Everything else connects to it.

### 5. The Receipt (Audit Trail)
**Engineering term**: Audit trail / Ledger

- **Tool**: Notion database called "Inbox Log"
- **Tracks**:
  - Original text captured
  - Where it was filed
  - What it was named
  - AI confidence score
  - Timestamp
  - Processing status

**Why it matters**: You don't abandon systems because they're imperfect. You abandon them because errors feel *mysterious*. The Receipt creates visibility. Visibility creates trust. Trust creates continued use.

### 6. The Bouncer (Confidence Filter)
**Engineering term**: Confidence filter / Guardrail

- **Rules**:
  - AI returns confidence score (0-1) for every classification
  - If confidence < 0.6, don't file to permanent databases
  - Instead: Log to Inbox with "needs_review" status
  - Send Slack reply: "I'm not sure where this goes. Can you repost with a prefix like #person or #project?"
  - Human clarifies in one message, system re-files

**Why it matters**: This single mechanism keeps your second brain from becoming a junk drawer. Garbage pollution is the #1 way these systems die. The Bouncer maintains trust.

### 7. The Tap on the Shoulder (Daily Nudges)
**Engineering term**: Proactive surfacing / Notifications

**Daily Digest** (arrives via Slack DM at your chosen time):
- Top 3 actions for today
- 1 thing you might be stuck on/avoiding
- 1 small win to notice
- **Target length**: <150 words (phone-screen readable)
- **Time to consume**: 2 minutes

**Weekly Review** (arrives Sunday at chosen time):
- What happened this week
- Your biggest open loops
- 3 suggested actions for next week
- 1 recurring theme the system noticed
- **Target length**: <250 words

**Why it matters**: Humans don't retrieve information consistently. We respond to what appears in front of us. The Tap puts the right info in your path without you having to search or remember to check.

### 8. The Fix Button (Easy Corrections)
**Engineering term**: Feedback handle / Human-in-loop correction

- When Zapier files something, it replies in the Slack thread: "Filed as: Project 'Website Relaunch' | Confidence: 0.87"
- To correct: Reply in thread with `fix: This should be people, not project`
- System immediately updates the Notion entry
- **Critical**: Corrections must be trivial or people won't make them

**Why it matters**: Systems get adopted when errors are easy to repair. If fixing requires opening Notion and navigating, people stop engaging.

## Twelve Engineering Principles

These principles govern how systems scale, stay reliable, and maintain trust:

### Principle 1: One Reliable Human Behavior
- Your job: Capture thoughts in Slack
- Everything else: Automation
- Classification by Claude/ChatGPT
- Filing by Zapier
- Surfacing by scheduled automation

**Why it works**: Systems fail when they require 3+ consistent behaviors. Reduce it to one.

### Principle 2: Separate Memory, Compute, and Interface
- **Memory**: Notion (truth lives here)
- **Compute**: Zapier + Claude/ChatGPT (logic lives here)
- **Interface**: Slack (humans live here)
- **Benefit**: Each layer is swappable
  - Swap Slack for Teams without rebuilding
  - Swap Claude for ChatGPT without touching databases
  - Migrate Notion to Airtable without rewriting logic

**Why it works**: Clear boundaries make systems portable and resilient.

### Principle 3: Treat Prompts Like APIs
- Not creative writing, not helpful generation
- Fixed input format + fixed output format = no surprises
- Specify exact fields, valid values, how to handle ambiguity
- Return JSON only, no explanation, no markdown

**Example prompt structure**:
```
Classify this thought into one of: person, project, idea, admin
Return JSON: {"category": "...", "confidence": 0.0-1.0, "fields": {...}}
For ambiguous cases, classify as "admin" with lower confidence.
```

**Why it works**: Reliable beats creative. You want the model to fill out forms, not be helpful in unpredictable ways.

### Principle 4: Build Trust Mechanisms, Not Just Capability
- **Capability**: The bot files notes
- **Trust mechanism**: You believe the filing enough to keep using it

Trust comes from:
- Inbox Log showing everything that happened
- Confidence scores you can inspect
- Fix Button making corrections trivial
- Small errors that don't compound

**Why it works**: Without trust, small errors accumulate and you abandon the system. With trust, it earns your confidence over time.

### Principle 5: Default to Safe Behavior When Uncertain
- When Claude/ChatGPT isn't sure: Don't file, just hold
- Log it with "needs_review" status
- Ask for clarification in Slack
- Wait for human input

**Why it works**: Graceful failure is how agentic systems maintain trust. It's boring but essential.

### Principle 6: Small, Frequent, Actionable Outputs
- Daily digest: <150 words, fits phone screen, 2 min read
- Weekly review: <250 words
- Not a 2,000-word analysis—a top-3 list

**Why it works**: Small outputs reduce cognitive load and increase follow-through. You get a breadcrumb of value and trust with every interaction.

### Principle 7: Use Next Action as the Unit of Execution
- **Bad**: "Work on the website"
- **Good**: "Email Sarah to confirm the copy deadline"

- Project database must have a "next_action" field
- Classification prompt must extract specific, executable actions
- Daily digest references next actions, not intentions

**Why it works**: Vague intentions don't move projects. Specific actions do. Actionable output makes the system operational, not motivational.

### Principle 8: Prefer Routing Over Organizing
- Humans hate organizing. Most of us just want to drop things in a box and forget.
- AI is excellent at routing (deciding where things go)
- Make the system route into small, stable buckets
- Recommended: 4 categories (people, projects, ideas, admin)
- More categories = more decisions = more friction = system dies

**Why it works**: Routing is automated. Organizing is work. People abandon work.

### Principle 9: Keep Categories and Fields Painfully Small
- Counterintuitive for smart people (we want richness, nuance)
- But richness creates friction, and friction kills adoption
- People database: 5 fields max
- Ideas database: 5 fields max
- You can add sophistication later if evidence supports it

**Why it works**: Minimal barriers to entry. Adopt first, sophisticate later.

### Principle 10: Design for Restart, Not Perfection
- Assume people will fall off (life happens: sickness, travel, busy weeks)
- System should be easy to restart without guilt
- Operating manual says: "Don't catch up. Just restart with a 10-minute brain dump and resume tomorrow."
- Automation keeps working whether you engage or not

**Why it works**: Systems that make you feel bad about gaps don't recover. Systems that are supportive and easy to restart do.

### Principle 11: Build Core Loop, Then Add Modules
- **Core loop** (MVP): Capture → File → Daily digest → Weekly review
- Build this first, make it work, establish trust
- **Optional modules** (add later):
  - Voice capture
  - Meeting prep (calendar integration)
  - Email forwarding
  - Birthday reminders
  - Recurring task automation

**Why it works**: You can't scale features you don't trust yet. Build simple, establish trust, then expand.

### Principle 12: Optimize for Maintainability Over Cleverness
- Moving parts are failure points
- Optimize for: fewer tools, fewer steps, clear logs, easy reconnects
- When Zapier breaks (Slack token expires), you should fix it in 5 minutes, not debug for an hour
- When Notion permissions get weird, reconnect and move on

**Why it works**: Elegance is fragile. Boring systems scale.

## System Flow (Illustrated)

```
1. Thought appears in your head
   ↓
2. You open Slack, post to #SB Inbox
   ("Just signed contract with new client")
   ↓
3. Zapier trigger fires (new message in channel)
   ↓
4. Zapier sends message text to Claude with classification prompt
   ↓
5. Claude returns JSON:
   {
     "category": "project",
     "confidence": 0.92,
     "name": "New Client Onboarding",
     "status": "active",
     "next_action": "Schedule kickoff call"
   }
   ↓
6. Confidence check: 0.92 > 0.6? Yes
   ↓
7. Zapier creates Notion record in Projects database
   ↓
8. Zapier logs entry to Inbox Log with original text + confidence
   ↓
9. Zapier replies in Slack thread:
   "Filed as Project: New Client Onboarding | Confidence: 0.92 | Reply 'fix' if wrong"
   ↓
10. You move on (thought is now safe, not in your head)
   ↓
[Every morning at 8am]
11. Zapier queries Notion: get all active projects + people with follow-ups
   ↓
12. Zapier sends to Claude with summarization prompt
   ↓
13. Claude returns daily digest (<150 words)
   ↓
14. Zapier sends digest to your Slack DM
   ↓
15. You read 2-minute digest, know what matters today
```

## Implementation Steps

### Step 1: Create the Slack Channel
- Go to Slack workspace
- Create new private channel: `#SB Inbox` (or your preference)
- Pin a message explaining: "Drop one thought per message. No organizing. No tagging."

### Step 2: Create Notion Databases
- Create new page: "Second Brain"
- Inside, create 5 databases as tables:
  1. **People**: name, context, follow-ups, last_touched, tags
  2. **Projects**: name, status, next_action, notes, tags
  3. **Ideas**: title, one_liner, notes, tags
  4. **Admin**: name, due_date, status, notes
  5. **Inbox Log**: captured_text, filed_to, filed_as, confidence, created_at, status

### Step 3: Connect Zapier
- Sign up for Zapier (zapier.com)
- Connect your Slack account
- Connect your Notion account
- Grant Zapier access to your "Second Brain" page in Notion

### Step 4: Build Three Zapier Automations

**Automation 1: Message Capture → Classification → Filing**
- Trigger: New message in #SB Inbox
- Action 1: Send message to Claude/ChatGPT with classification prompt
- Action 2: Parse JSON response
- Action 3: Route based on category (if person → create in People, if project → Projects, etc.)
- Action 4: Create entry in Inbox Log
- Action 5: Reply in Slack thread with confirmation + confidence + "reply fix if wrong"

**Automation 2: Daily Digest**
- Trigger: Daily schedule (8am or your preference)
- Action 1: Query Notion for all active projects + people with follow-ups
- Action 2: Send to Claude/ChatGPT with summarization prompt
- Action 3: Send result to your Slack DM

**Automation 3: Weekly Review**
- Trigger: Weekly schedule (Sunday 4pm or your preference)
- Action 1: Query Notion for all entries from past 7 days
- Action 2: Send to Claude/ChatGPT with review prompt
- Action 3: Send result to your Slack DM

### Step 5: Optional—Add Voice Capture
- Later, add voice note capture to Slack
- System processes audio, classifies, files automatically

### Step 6: Optional—Add Email Forwarding
- Later, enable email forwarding to a dedicated address
- Zapier reads incoming emails, processes same way

## What It Feels Like When It's Working

**Immediate effects**:
- You feel lighter. Open loops in your head start closing.
- You think "I should remember that" → you post to #SB Inbox → you forget about it safely
- Your head gets clearer because you're not running background threads of "don't forget"

**Medium-term effects**:
- You show up with more continuity for people and projects that matter
- You remember details without struggling
- Project patterns emerge over time (you get smarter about what you input)

**Long-term effects**:
- Anxiety changes character: stops being background hum of untrackedcommitments, becomes small set of actionable next steps
- Your work compounds because you're building on previous work intentionally
- You create more value because you're not paying the "storage tax" on your brain

## Key Metrics for Success

- **Daily usage**: Post to #SB Inbox at least once per day
- **Trust score**: Do you check your daily digest without prompting?
- **Fix rate**: Are you correcting misclassifications when you notice them?
- **Completeness**: Can you trace where any thought ended up via Inbox Log?

## Common Pitfalls to Avoid

1. **Too many capture points**: One channel only. Multiple channels = system dies.
2. **Too many categories**: Stick with 4 (people, projects, ideas, admin) until you have evidence you need more.
3. **Too many fields**: Start with minimal fields. Add complexity only when you have evidence.
4. **Trying to organize manually**: Don't organize. Let the system route. Your job is capture only.
5. **Ignoring low-confidence items**: Use the Bouncer. When confidence is low, ask for clarification. This maintains trust.
6. **Catching up after gaps**: Don't. Just do a 10-minute brain dump and restart. The system waits for you.
7. **Treating prompts as creative**: Be precise. Prompts are APIs, not art. Fixed input, fixed output.

## Why This Matters in 2026

For the first time in human history:
- You have systems that work on your information *while you sleep*
- You don't have to remember to organize or retrieve
- AI classifies your thoughts without you deciding
- The right information surfaces without you searching
- You get nudged toward your goals without remembering them
- And you don't need to be an engineer to build this

Your brain was designed to think, not store. A second brain does the storing so your brain can do what it's actually good at. That's the leap.

