import { env, runInDurableObject, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';
import { SecondBrainAgent } from '../src/agent';

// Type for requests
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('Second Brain Worker', () => {
	describe('Health endpoint', () => {
		it('returns OK for /health', async () => {
			const request = new IncomingRequest('https://example.com/health');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			expect(await response.text()).toBe('OK');
		});
	});

	describe('404 handling', () => {
		it('returns 404 for unknown paths', async () => {
			const request = new IncomingRequest('https://example.com/unknown');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(404);
			expect(await response.text()).toBe('Not found');
		});
	});
});

describe('SecondBrainAgent', () => {
	it('handles URL verification challenge', async () => {
		const id = env.SecondBrainAgent.idFromName('test-verification');
		const stub = env.SecondBrainAgent.get(id);

		await runInDurableObject(stub, async (instance: SecondBrainAgent) => {
			const request = new Request('https://example.com/slack/events', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type: 'url_verification',
					challenge: 'test-challenge-123',
					token: 'test-token',
				}),
			});

			const response = await instance.fetch(request);

			expect(response.status).toBe(200);
			expect(await response.text()).toBe('test-challenge-123');
		});
	});

	it('rejects non-POST requests', async () => {
		const id = env.SecondBrainAgent.idFromName('test-method');
		const stub = env.SecondBrainAgent.get(id);

		await runInDurableObject(stub, async (instance: SecondBrainAgent) => {
			const request = new Request('https://example.com/slack/events', {
				method: 'GET',
			});

			const response = await instance.fetch(request);

			expect(response.status).toBe(405);
		});
	});

	it('returns 400 for invalid JSON', async () => {
		const id = env.SecondBrainAgent.idFromName('test-invalid-json');
		const stub = env.SecondBrainAgent.get(id);

		await runInDurableObject(stub, async (instance: SecondBrainAgent) => {
			const request = new Request('https://example.com/slack/events', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: 'not valid json',
			});

			const response = await instance.fetch(request);

			expect(response.status).toBe(400);
			expect(await response.text()).toBe('Invalid JSON');
		});
	});

	it('returns 400 for unknown event type', async () => {
		const id = env.SecondBrainAgent.idFromName('test-unknown-event');
		const stub = env.SecondBrainAgent.get(id);

		await runInDurableObject(stub, async (instance: SecondBrainAgent) => {
			const request = new Request('https://example.com/slack/events', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type: 'unknown_event_type',
				}),
			});

			const response = await instance.fetch(request);

			expect(response.status).toBe(400);
			expect(await response.text()).toBe('Unknown event type');
		});
	});
});
