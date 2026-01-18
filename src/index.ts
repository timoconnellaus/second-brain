// Export the agent class for Durable Object binding
export { SecondBrainAgent } from './agent';

export default {
	async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// Health check endpoint
		if (url.pathname === '/health') {
			return new Response('OK', { status: 200 });
		}

		// Slack webhook endpoint - route to agent
		if (url.pathname === '/slack/events') {
			// Get or create the main agent instance using a fixed ID
			const id = env.SecondBrainAgent.idFromName('main');
			const stub = env.SecondBrainAgent.get(id);
			return stub.fetch(request);
		}

		// Slack interactions endpoint (button clicks) - route to agent
		if (url.pathname === '/slack/interactions') {
			const id = env.SecondBrainAgent.idFromName('main');
			const stub = env.SecondBrainAgent.get(id);
			// Forward to agent with a header to distinguish from events
			const interactionRequest = new Request(request.url, {
				method: request.method,
				headers: new Headers([...request.headers.entries(), ['x-slack-interaction', 'true']]),
				body: request.body,
			});
			return stub.fetch(interactionRequest);
		}

		return new Response('Not found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;
