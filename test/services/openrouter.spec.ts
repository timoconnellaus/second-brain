import { fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { classify } from '../../src/services/openrouter';

describe('OpenRouter service', () => {
	beforeAll(() => {
		fetchMock.activate();
		fetchMock.disableNetConnect();
	});

	afterEach(() => {
		fetchMock.assertNoPendingInterceptors();
	});

	it('classifies a person message', async () => {
		fetchMock
			.get('https://openrouter.ai')
			.intercept({ path: '/api/v1/chat/completions', method: 'POST' })
			.reply(
				200,
				{
					id: 'gen-123',
					choices: [
						{
							message: {
								role: 'assistant',
								content: JSON.stringify({
									category: 'person',
									confidence: 0.92,
									name: 'Sarah',
									fields: {
										name: 'Sarah',
										context: 'Met for coffee, looking for frontend dev',
									},
								}),
							},
							finish_reason: 'stop',
						},
					],
					usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
				},
				{ headers: { 'Content-Type': 'application/json' } }
			);

		const result = await classify('Had coffee with Sarah - she is looking for a frontend dev', 'test-api-key');

		expect(result.category).toBe('person');
		expect(result.confidence).toBe(0.92);
		expect(result.name).toBe('Sarah');
		expect(result.fields).toMatchObject({ name: 'Sarah' });
	});

	it('classifies a project message', async () => {
		fetchMock
			.get('https://openrouter.ai')
			.intercept({ path: '/api/v1/chat/completions', method: 'POST' })
			.reply(
				200,
				{
					id: 'gen-124',
					choices: [
						{
							message: {
								role: 'assistant',
								content: JSON.stringify({
									category: 'project',
									confidence: 0.88,
									name: 'Website Redesign',
									fields: {
										name: 'Website Redesign',
										next_action: 'Create wireframes for homepage',
										status: 'active',
									},
								}),
							},
							finish_reason: 'stop',
						},
					],
					usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
				},
				{ headers: { 'Content-Type': 'application/json' } }
			);

		const result = await classify('Need to redesign the website, start with wireframes', 'test-api-key');

		expect(result.category).toBe('project');
		expect(result.confidence).toBe(0.88);
		expect(result.name).toBe('Website Redesign');
	});

	it('classifies an admin message', async () => {
		fetchMock
			.get('https://openrouter.ai')
			.intercept({ path: '/api/v1/chat/completions', method: 'POST' })
			.reply(
				200,
				{
					id: 'gen-125',
					choices: [
						{
							message: {
								role: 'assistant',
								content: JSON.stringify({
									category: 'admin',
									confidence: 0.95,
									name: 'Renew passport',
									fields: {
										name: 'Renew passport',
										due_date: '2025-03-15',
										status: 'pending',
									},
								}),
							},
							finish_reason: 'stop',
						},
					],
					usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
				},
				{ headers: { 'Content-Type': 'application/json' } }
			);

		const result = await classify('Need to renew passport by March 15', 'test-api-key');

		expect(result.category).toBe('admin');
		expect(result.confidence).toBe(0.95);
	});

	it('classifies an idea message', async () => {
		fetchMock
			.get('https://openrouter.ai')
			.intercept({ path: '/api/v1/chat/completions', method: 'POST' })
			.reply(
				200,
				{
					id: 'gen-126',
					choices: [
						{
							message: {
								role: 'assistant',
								content: JSON.stringify({
									category: 'idea',
									confidence: 0.85,
									name: 'AI-powered journaling',
									fields: {
										name: 'AI-powered journaling',
										one_liner: 'Use AI to analyze journal entries and surface patterns',
									},
								}),
							},
							finish_reason: 'stop',
						},
					],
					usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
				},
				{ headers: { 'Content-Type': 'application/json' } }
			);

		const result = await classify('What if we used AI to analyze journal entries and find patterns?', 'test-api-key');

		expect(result.category).toBe('idea');
		expect(result.confidence).toBe(0.85);
	});

	it('throws error on API failure', async () => {
		fetchMock
			.get('https://openrouter.ai')
			.intercept({ path: '/api/v1/chat/completions', method: 'POST' })
			.reply(500, 'Internal Server Error');

		await expect(classify('test message', 'test-api-key')).rejects.toThrow('OpenRouter API error: 500');
	});

	it('throws error on invalid JSON response', async () => {
		fetchMock
			.get('https://openrouter.ai')
			.intercept({ path: '/api/v1/chat/completions', method: 'POST' })
			.reply(
				200,
				{
					id: 'gen-127',
					choices: [
						{
							message: {
								role: 'assistant',
								content: 'not valid json',
							},
							finish_reason: 'stop',
						},
					],
					usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
				},
				{ headers: { 'Content-Type': 'application/json' } }
			);

		await expect(classify('test message', 'test-api-key')).rejects.toThrow();
	});
});
