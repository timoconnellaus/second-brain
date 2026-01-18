import { fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createPerson, createProject, createIdea, createAdmin, createInboxLog, queryDatabase } from '../../src/services/notion';

const mockNotionPage = {
	id: 'page-123',
	object: 'page' as const,
	created_time: '2025-01-18T00:00:00.000Z',
	last_edited_time: '2025-01-18T00:00:00.000Z',
	url: 'https://notion.so/page-123',
};

describe('Notion service', () => {
	beforeAll(() => {
		fetchMock.activate();
		fetchMock.disableNetConnect();
	});

	afterEach(() => {
		fetchMock.assertNoPendingInterceptors();
	});

	describe('createPerson', () => {
		it('creates a person entry', async () => {
			fetchMock
				.get('https://api.notion.com')
				.intercept({ path: '/v1/pages', method: 'POST' })
				.reply(200, mockNotionPage, { headers: { 'Content-Type': 'application/json' } });

			const result = await createPerson(
				{
					name: 'Sarah',
					context: 'Met at conference',
					last_touched: '2025-01-18',
				},
				'test-token',
				'db-people-123'
			);

			expect(result.id).toBe('page-123');
		});

		it('throws on API error', async () => {
			fetchMock
				.get('https://api.notion.com')
				.intercept({ path: '/v1/pages', method: 'POST' })
				.reply(400, 'Bad Request');

			await expect(
				createPerson({ name: 'Test', last_touched: '2025-01-18' }, 'test-token', 'db-123')
			).rejects.toThrow('Notion API error: 400');
		});
	});

	describe('createProject', () => {
		it('creates a project entry', async () => {
			fetchMock
				.get('https://api.notion.com')
				.intercept({ path: '/v1/pages', method: 'POST' })
				.reply(200, mockNotionPage, { headers: { 'Content-Type': 'application/json' } });

			const result = await createProject(
				{
					name: 'Website Redesign',
					next_action: 'Create wireframes',
					status: 'active',
				},
				'test-token',
				'db-projects-123'
			);

			expect(result.id).toBe('page-123');
		});
	});

	describe('createIdea', () => {
		it('creates an idea entry', async () => {
			fetchMock
				.get('https://api.notion.com')
				.intercept({ path: '/v1/pages', method: 'POST' })
				.reply(200, mockNotionPage, { headers: { 'Content-Type': 'application/json' } });

			const result = await createIdea(
				{
					name: 'AI Journaling',
					one_liner: 'Use AI to analyze journal patterns',
				},
				'test-token',
				'db-ideas-123'
			);

			expect(result.id).toBe('page-123');
		});
	});

	describe('createAdmin', () => {
		it('creates an admin entry', async () => {
			fetchMock
				.get('https://api.notion.com')
				.intercept({ path: '/v1/pages', method: 'POST' })
				.reply(200, mockNotionPage, { headers: { 'Content-Type': 'application/json' } });

			const result = await createAdmin(
				{
					name: 'Renew passport',
					due_date: '2025-03-15',
					status: 'pending',
				},
				'test-token',
				'db-admin-123'
			);

			expect(result.id).toBe('page-123');
		});
	});

	describe('createInboxLog', () => {
		it('creates an inbox log entry', async () => {
			fetchMock
				.get('https://api.notion.com')
				.intercept({ path: '/v1/pages', method: 'POST' })
				.reply(200, mockNotionPage, { headers: { 'Content-Type': 'application/json' } });

			const result = await createInboxLog(
				{
					record_name: 'Sarah',
					captured_text: 'Had coffee with Sarah',
					confidence: 0.92,
					created: '2025-01-18T00:00:00.000Z',
					destination: 'person',
				},
				'test-token',
				'db-inbox-123'
			);

			expect(result.id).toBe('page-123');
		});
	});

	describe('queryDatabase', () => {
		it('queries a database', async () => {
			fetchMock
				.get('https://api.notion.com')
				.intercept({ path: '/v1/databases/db-123/query', method: 'POST' })
				.reply(
					200,
					{
						object: 'list',
						results: [mockNotionPage],
						has_more: false,
						next_cursor: null,
					},
					{ headers: { 'Content-Type': 'application/json' } }
				);

			const results = await queryDatabase('db-123', 'test-token');

			expect(results).toHaveLength(1);
			expect(results[0].id).toBe('page-123');
		});

		it('queries with filter', async () => {
			fetchMock
				.get('https://api.notion.com')
				.intercept({ path: '/v1/databases/db-123/query', method: 'POST' })
				.reply(
					200,
					{
						object: 'list',
						results: [mockNotionPage],
						has_more: false,
						next_cursor: null,
					},
					{ headers: { 'Content-Type': 'application/json' } }
				);

			const results = await queryDatabase('db-123', 'test-token', {
				property: 'Status',
				select: { equals: 'active' },
			});

			expect(results).toHaveLength(1);
		});
	});
});
