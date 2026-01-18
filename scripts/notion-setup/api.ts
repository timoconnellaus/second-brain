import type { NotionDatabase, NotionPropertyConfig } from './types';

const NOTION_API_URL = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

function getHeaders(token: string): Record<string, string> {
	return {
		Authorization: `Bearer ${token}`,
		'Content-Type': 'application/json',
		'Notion-Version': NOTION_VERSION,
	};
}

/**
 * Get database details by ID.
 * Returns null if database doesn't exist or is inaccessible.
 */
export async function getDatabase(databaseId: string, token: string): Promise<NotionDatabase | null> {
	const response = await fetch(`${NOTION_API_URL}/databases/${databaseId}`, {
		method: 'GET',
		headers: getHeaders(token),
	});

	if (response.status === 404) {
		return null;
	}

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Notion API error (GET database): ${response.status} - ${errorText}`);
	}

	return (await response.json()) as NotionDatabase;
}

/**
 * Create a new database under a parent page.
 */
export async function createDatabase(
	parentPageId: string,
	title: string,
	properties: NotionPropertyConfig,
	token: string
): Promise<NotionDatabase> {
	const response = await fetch(`${NOTION_API_URL}/databases`, {
		method: 'POST',
		headers: getHeaders(token),
		body: JSON.stringify({
			parent: { type: 'page_id', page_id: parentPageId },
			title: [{ type: 'text', text: { content: title } }],
			properties,
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Notion API error (POST database): ${response.status} - ${errorText}`);
	}

	return (await response.json()) as NotionDatabase;
}

/**
 * Update database properties.
 * This merges with existing properties - new properties are added,
 * existing properties with the same name are updated.
 */
export async function updateDatabase(
	databaseId: string,
	properties: NotionPropertyConfig,
	token: string
): Promise<NotionDatabase> {
	const response = await fetch(`${NOTION_API_URL}/databases/${databaseId}`, {
		method: 'PATCH',
		headers: getHeaders(token),
		body: JSON.stringify({ properties }),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Notion API error (PATCH database): ${response.status} - ${errorText}`);
	}

	return (await response.json()) as NotionDatabase;
}
