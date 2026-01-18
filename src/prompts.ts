export const CLASSIFICATION_PROMPT = `You are a classifier for a personal knowledge system. Your job is to categorize thoughts and extract structured data.

## Categories

- **person**: Information about a specific individual
  Extract: name, nicknames (array of alternative names/shortened names, e.g. ["Tim"] for "Timothy"), context (how they know them), follow_ups (things to remember)

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

{message_text}`;

export const DAILY_DIGEST_PROMPT = `Generate a brief daily digest from this data. Be concise (<150 words).
Focus on what's actionable TODAY. Use bullet points.

Active Projects: {projects}
People needing attention: {stale_people}
Recent captures: {recent_inbox}`;

export const WEEKLY_REVIEW_PROMPT = `Generate a weekly review from this data. Be concise (<250 words).
Help the user see patterns and prioritize.

This week's captures: {weekly_entries}
All active projects: {projects}
Stale items: {stale_items}`;

export const THREAD_INTENT_PROMPT = `You are analyzing a reply in a conversation thread about a captured thought in a personal knowledge system.

## Original Captured Message
{original_message}

## Original Classification
Category: {category}
Name: {name}
Fields: {fields}

## Conversation History
{conversation_history}

## New Reply
{new_reply}

## Determine User Intent

What does the user want to do? Choose ONE:
1. **correct_category** - Change the category (e.g., "this is actually a project", "should be a person")
2. **update_field** - Update a specific field (e.g., "change the name to X", "add follow-up: call next week")
3. **add_context** - Add more information to the existing entry
4. **create_related** - Create a new related entry (e.g., "also add their colleague Bob")
5. **query** - Ask a question about existing data (e.g., "do I know anyone else at that company?")
6. **unclear** - Cannot determine intent

## Output Format

Return ONLY valid JSON:
{
  "intent": "correct_category" | "update_field" | "add_context" | "create_related" | "query" | "unclear",
  "details": {
    // For correct_category: { "newCategory": "project" | "person" | "idea" | "admin" }
    // For update_field: { "field": "name" | "context" | "follow_ups" | "next_action" | "notes" | "due_date", "value": "new value" }
    // For add_context: { "context": "additional info to append" }
    // For create_related: { "category": "...", "name": "...", "fields": {...} }
    // For query: { "question": "the user's question" }
    // For unclear: {}
  },
  "confidence": <number 0.0-1.0>
}`;

export const INTENT_DETECTION_PROMPT = `You are analyzing a message to a personal knowledge system. Determine if the user wants to:

1. **capture** - Save new information (a thought, person, project, idea, or task)
2. **query** - Ask about or retrieve existing information

## Examples

capture:
- "Met John at the conference, he works at Google"
- "Idea: we should try serverless"
- "Need to call dentist tomorrow"
- "Sarah mentioned she's looking for a new job"

query:
- "Who did I meet last month?"
- "What projects are stalled?"
- "Remind me about Sarah"
- "What was that idea about serverless?"
- "How many people do I know at Google?"
- "Show me my active projects"

## Message to Analyze

{message}

## Output Format

Return ONLY valid JSON:
{
  "intent": "capture" | "query",
  "confidence": <number 0.0-1.0>
}`;

export const QUERY_PROMPT = `You are a helpful assistant for a personal knowledge system. The user is asking a question about their data.

## Available Data Sources
- People: Contacts with name, nicknames, context, follow-ups, last touched date
- Projects: Tasks with name, next action, notes, status (active/waiting/blocked/someday/done)
- Ideas: Concepts with name, one-liner summary, notes
- Admin: Administrative tasks with name, due date, status (pending/done)

## Search Results
{search_results}

## User Question
{question}

## Instructions
1. Answer the user's question based on the search results
2. Be concise but helpful
3. If no relevant results, say so and suggest what they might try
4. Format names and key info clearly

Respond naturally as a helpful assistant.`;

export const MODEL = 'google/gemini-3-flash-preview';
export const CONFIDENCE_THRESHOLD = 0.6;
