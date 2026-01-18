# Cloudflare Agents SDK Reference

Quick reference for building AI agents with persistent state, scheduling, and real-time communication.

## What Are Agents?

Agents are **Durable Objects** with superpowers. They're globally addressable, single-threaded compute instances with:

- **Persistent state** (survives restarts)
- **Built-in SQLite database**
- **WebSocket support** for real-time communication
- **Scheduling** (alarms, cron jobs)
- **Task queues** for async work

The inheritance chain: `DurableObject` → `Server` (PartyKit) → `Agent`

## Installation

```bash
npm install agents @cloudflare/agents
```

## Basic Agent Structure

```typescript
import { Agent } from "agents";

type Env = {
  // Your bindings
  SecondBrainAgent: DurableObjectNamespace;
};

type State = {
  count: number;
};

export class SecondBrainAgent extends Agent<Env, State> {
  // Default state for new instances
  initialState = { count: 0 };

  // Called when agent starts/wakes from hibernation
  async onStart() {
    console.log("Agent starting, state:", this.state);
  }

  // Handle HTTP requests
  async onRequest(request: Request): Promise<Response> {
    return new Response("Hello from agent!");
  }

  // Handle WebSocket connections
  async onConnect(connection: Connection, ctx: ConnectionContext) {
    connection.send("Welcome!");
  }

  // Handle WebSocket messages
  async onMessage(connection: Connection, message: WSMessage) {
    console.log("Received:", message);
  }
}
```

## Wrangler Configuration

```jsonc
// wrangler.jsonc
{
  "name": "second-brain",
  "main": "src/index.ts",
  "compatibility_date": "2025-01-01",
  "durable_objects": {
    "bindings": [
      {
        "name": "SecondBrainAgent",
        "class_name": "SecondBrainAgent"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["SecondBrainAgent"]
    }
  ]
}
```

## Worker Entry Point

```typescript
// src/index.ts
import { routeAgentRequest } from "agents";

export { SecondBrainAgent } from "./agent";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // Route to agent based on URL pattern
    const response = await routeAgentRequest(request, env);
    if (response) return response;

    return new Response("Not found", { status: 404 });
  }
};
```

## State Management

State is automatically persisted to SQLite and survives restarts.

```typescript
class MyAgent extends Agent<Env, { count: number; items: string[] }> {
  initialState = { count: 0, items: [] };

  increment() {
    // setState persists AND broadcasts to connected clients
    this.setState({
      ...this.state,
      count: this.state.count + 1
    });
  }

  // Called whenever state changes
  onStateUpdate(state: State, source: "server" | "client") {
    console.log("State updated:", state, "from:", source);
  }
}
```

## SQL Database

Each agent has an embedded SQLite database.

```typescript
class MyAgent extends Agent {
  onStart() {
    // Create tables
    this.sql`
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        text TEXT,
        category TEXT,
        created_at INTEGER
      )
    `;
  }

  addEntry(id: string, text: string, category: string) {
    this.sql`
      INSERT INTO entries (id, text, category, created_at)
      VALUES (${id}, ${text}, ${category}, ${Date.now()})
    `;
  }

  getEntries(category: string) {
    return this.sql<{ id: string; text: string }>`
      SELECT id, text FROM entries WHERE category = ${category}
    `;
  }
}
```

## Scheduling

Schedule methods to run at specific times or intervals.

```typescript
class MyAgent extends Agent {
  async setupSchedules() {
    // Run at specific time
    await this.schedule(
      new Date("2025-01-20T06:00:00Z"),
      "dailyDigest",
      { type: "morning" }
    );

    // Run after delay (seconds)
    await this.schedule(60, "checkStatus", { check: "health" });

    // Cron expression (daily at 6am)
    await this.schedule("0 6 * * *", "dailyDigest", { type: "daily" });

    // Cron expression (Sunday at 4pm)
    await this.schedule("0 16 * * 0", "weeklyReview", {});
  }

  // Callback methods receive the payload
  async dailyDigest(payload: { type: string }) {
    console.log("Running digest:", payload.type);
  }

  async weeklyReview(payload: {}) {
    console.log("Weekly review time!");
  }
}
```

### Schedule Management

```typescript
// Get a specific schedule
const schedule = await this.getSchedule(scheduleId);

// Query schedules
const schedules = await this.getSchedules({
  type: "cron",  // "scheduled" | "delayed" | "cron"
  callback: "dailyDigest",
});

// Cancel a schedule
await this.cancelSchedule(scheduleId);
```

## Task Queue

Queue tasks for asynchronous FIFO processing.

```typescript
class MyAgent extends Agent {
  async onMessage(connection: Connection, message: string) {
    // Queue a task
    const taskId = await this.queue("processMessage", {
      text: message,
      timestamp: Date.now()
    });
  }

  // Task callback - receives payload and queue item
  async processMessage(
    payload: { text: string; timestamp: number },
    queueItem: QueueItem
  ) {
    console.log(`Processing task ${queueItem.id}:`, payload.text);
    // Task is auto-dequeued on success
  }
}
```

### Queue Management

```typescript
// Remove specific task
await this.dequeue(taskId);

// Remove all tasks
await this.dequeueAll();

// Remove all tasks for a callback
await this.dequeueAllByCallback("processMessage");

// Get task by ID
const task = await this.getQueue(taskId);

// Find tasks by payload field
const tasks = await this.getQueues("userId", "123");
```

## WebSocket Communication

### Server-side

```typescript
class MyAgent extends Agent {
  async onConnect(connection: Connection, ctx: ConnectionContext) {
    const { request } = ctx;
    console.log("New connection from:", request.url);
    connection.send(JSON.stringify({ type: "welcome" }));
  }

  async onMessage(connection: Connection, message: WSMessage) {
    const data = JSON.parse(message as string);

    // Send to this connection
    connection.send(JSON.stringify({ type: "ack" }));

    // Broadcast to all connections
    this.broadcast(JSON.stringify({ type: "update", data }));
  }

  async onClose(connection: Connection, code: number, reason: string) {
    console.log("Connection closed:", code, reason);
  }

  async onError(connection: Connection, error: unknown) {
    console.error("Connection error:", error);
  }
}
```

### Client-side (React)

```typescript
import { useAgent } from "agents/react";

function MyComponent() {
  const agent = useAgent({
    agent: "SecondBrainAgent",  // kebab-case of class name
    name: "user-123",           // instance identifier
    onStateUpdate: (state) => {
      console.log("State updated:", state);
    }
  });

  // Send message
  agent.send(JSON.stringify({ type: "hello" }));

  // Update state (broadcasts to server and other clients)
  agent.setState({ count: 5 });
}
```

## RPC Methods

Make methods callable from clients via WebSocket.

```typescript
import { callable } from "agents";

class MyAgent extends Agent {
  @callable({ description: "Add two numbers" })
  async add(a: number, b: number) {
    return a + b;
  }

  @callable({ stream: true, description: "Stream data" })
  async *streamData() {
    yield "chunk1";
    yield "chunk2";
  }
}
```

Client calls:

```typescript
const { stub } = useAgent({ agent: "my-agent" });
const result = await stub.add(2, 3); // 5
```

## Context Management

Access agent context from anywhere.

```typescript
import { getCurrentAgent } from "agents";

// Utility function that needs agent context
async function logActivity(action: string) {
  const { agent, connection, request } = getCurrentAgent<MyAgent>();
  console.log(`Agent ${agent?.name}: ${action}`);
}

class MyAgent extends Agent {
  async customMethod() {
    // Context automatically available
    await logActivity("doing something");
  }
}
```

## HTTP Request Handling

```typescript
class MyAgent extends Agent {
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/webhook" && request.method === "POST") {
      const body = await request.json();
      await this.processWebhook(body);
      return new Response("OK");
    }

    if (url.pathname === "/status") {
      return Response.json({
        state: this.state,
        connections: this.getConnections().length
      });
    }

    return new Response("Not found", { status: 404 });
  }
}
```

## Routing to Agents

```typescript
// Route by URL pattern: /agents/:className/:instanceName
import { routeAgentRequest, getAgentByName } from "agents";

export default {
  async fetch(request: Request, env: Env) {
    // Automatic routing
    const response = await routeAgentRequest(request, env);
    if (response) return response;

    // Or manual routing
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/brain/")) {
      const agent = await getAgentByName(env.SecondBrainAgent, "main");
      return agent.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  }
};
```

## Environment Access

```typescript
class MyAgent extends Agent<Env> {
  async callExternalAPI() {
    // Access env bindings
    const apiKey = this.env.API_KEY;
    const kv = this.env.MY_KV;

    // Use fetch
    const response = await fetch("https://api.example.com", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
  }
}
```

## Error Handling

```typescript
class MyAgent extends Agent {
  onError(connectionOrError: Connection | unknown, error?: unknown) {
    if (error) {
      // WebSocket error
      console.error("WebSocket error:", error);
    } else {
      // General error
      console.error("Agent error:", connectionOrError);
    }
  }
}
```

## Cleanup

```typescript
class MyAgent extends Agent {
  async cleanup() {
    // Wipe everything: tables, alarms, storage
    await this.destroy();
  }
}
```

## Key Tables (Auto-created)

| Table | Purpose |
|-------|---------|
| `cf_agents_state` | Agent state storage |
| `cf_agents_schedules` | Scheduled tasks |
| `cf_agents_queues` | Task queue |

## Full Docs

See `docs/agents-sdk/` for complete documentation:
- `agent-class.md` - Deep dive into Agent class
- `queue.md` - Queue system details
- `context-management.md` - Context and getCurrentAgent()
- `resumable-streaming.md` - AI streaming with auto-resume
- `mcp-servers.md` - Model Context Protocol integration
