import type { Category, NotionPerson, NotionProject, NotionIdea, NotionAdmin, NotionInboxLog } from '../types';

const NOTION_API_URL = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

interface NotionPage {
	id: string;
	object: 'page';
	created_time: string;
	last_edited_time: string;
	url: string;
}

interface NotionQueryResponse {
	object: 'list';
	results: NotionPage[];
	has_more: boolean;
	next_cursor: string | null;
}

function getHeaders(token: string): Record<string, string> {
	return {
		Authorization: `Bearer ${token}`,
		'Content-Type': 'application/json',
		'Notion-Version': NOTION_VERSION,
	};
}

// Create a person entry
export async function createPerson(data: NotionPerson, token: string, databaseId: string): Promise<NotionPage> {
	const response = await fetch(`${NOTION_API_URL}/pages`, {
		method: 'POST',
		headers: getHeaders(token),
		body: JSON.stringify({
			parent: { database_id: databaseId },
			properties: {
				Name: { title: [{ text: { content: data.name } }] },
				Nicknames:
					data.nicknames && data.nicknames.length > 0
						? { rich_text: [{ text: { content: data.nicknames.join(', ') } }] }
						: undefined,
				Context: data.context ? { rich_text: [{ text: { content: data.context } }] } : undefined,
				'Follow-ups': data.follow_ups ? { rich_text: [{ text: { content: data.follow_ups } }] } : undefined,
				'Last Touched': { date: { start: data.last_touched } },
				Tags: data.tags ? { multi_select: data.tags.map((tag) => ({ name: tag })) } : undefined,
			},
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Notion API error: ${response.status} - ${errorText}`);
	}

	return (await response.json()) as NotionPage;
}

// Create a project entry
export async function createProject(data: NotionProject, token: string, databaseId: string): Promise<NotionPage> {
	const response = await fetch(`${NOTION_API_URL}/pages`, {
		method: 'POST',
		headers: getHeaders(token),
		body: JSON.stringify({
			parent: { database_id: databaseId },
			properties: {
				Name: { title: [{ text: { content: data.name } }] },
				'Next Action': data.next_action ? { rich_text: [{ text: { content: data.next_action } }] } : undefined,
				Notes: data.notes ? { rich_text: [{ text: { content: data.notes } }] } : undefined,
				Status: { select: { name: data.status } },
			},
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Notion API error: ${response.status} - ${errorText}`);
	}

	return (await response.json()) as NotionPage;
}

// Create an idea entry
export async function createIdea(data: NotionIdea, token: string, databaseId: string): Promise<NotionPage> {
	const response = await fetch(`${NOTION_API_URL}/pages`, {
		method: 'POST',
		headers: getHeaders(token),
		body: JSON.stringify({
			parent: { database_id: databaseId },
			properties: {
				Name: { title: [{ text: { content: data.name } }] },
				'One-liner': data.one_liner ? { rich_text: [{ text: { content: data.one_liner } }] } : undefined,
				Notes: data.notes ? { rich_text: [{ text: { content: data.notes } }] } : undefined,
				Tags: data.tags ? { multi_select: data.tags.map((tag) => ({ name: tag })) } : undefined,
			},
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Notion API error: ${response.status} - ${errorText}`);
	}

	return (await response.json()) as NotionPage;
}

// Create an admin entry
export async function createAdmin(data: NotionAdmin, token: string, databaseId: string): Promise<NotionPage> {
	const response = await fetch(`${NOTION_API_URL}/pages`, {
		method: 'POST',
		headers: getHeaders(token),
		body: JSON.stringify({
			parent: { database_id: databaseId },
			properties: {
				Name: { title: [{ text: { content: data.name } }] },
				'Due Date': data.due_date ? { date: { start: data.due_date } } : undefined,
				Status: { select: { name: data.status } },
			},
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Notion API error: ${response.status} - ${errorText}`);
	}

	return (await response.json()) as NotionPage;
}

// Create an inbox log entry
export async function createInboxLog(data: NotionInboxLog, token: string, databaseId: string): Promise<NotionPage> {
	const response = await fetch(`${NOTION_API_URL}/pages`, {
		method: 'POST',
		headers: getHeaders(token),
		body: JSON.stringify({
			parent: { database_id: databaseId },
			properties: {
				'Record Name': { title: [{ text: { content: data.record_name } }] },
				'Captured Text': { rich_text: [{ text: { content: data.captured_text } }] },
				Confidence: { number: data.confidence },
				Created: { date: { start: data.created } },
				Destination: { select: { name: data.destination } },
			},
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Notion API error: ${response.status} - ${errorText}`);
	}

	return (await response.json()) as NotionPage;
}

// Query a database with optional filter
export async function queryDatabase(
	databaseId: string,
	token: string,
	filter?: Record<string, unknown>
): Promise<NotionPage[]> {
	const response = await fetch(`${NOTION_API_URL}/databases/${databaseId}/query`, {
		method: 'POST',
		headers: getHeaders(token),
		body: JSON.stringify({ filter }),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Notion API error: ${response.status} - ${errorText}`);
	}

	const data = (await response.json()) as NotionQueryResponse;
	return data.results;
}

// Update a page
export async function updatePage(
	pageId: string,
	properties: Record<string, unknown>,
	token: string
): Promise<NotionPage> {
	const response = await fetch(`${NOTION_API_URL}/pages/${pageId}`, {
		method: 'PATCH',
		headers: getHeaders(token),
		body: JSON.stringify({ properties }),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Notion API error: ${response.status} - ${errorText}`);
	}

	return (await response.json()) as NotionPage;
}

// Helper to get the right database ID based on category
export function getDatabaseId(category: Category, env: Env): string {
	switch (category) {
		case 'person':
			return env.NOTION_DB_PEOPLE;
		case 'project':
			return env.NOTION_DB_PROJECTS;
		case 'idea':
			return env.NOTION_DB_IDEAS;
		case 'admin':
			return env.NOTION_DB_ADMIN;
	}
}
