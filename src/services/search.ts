import type { Category } from '../types';
import { queryDatabase, getDatabaseId } from './notion';

const NOTION_API_URL = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// Extended page type that includes properties for search results
export interface NotionPageWithProperties {
	id: string;
	object: 'page';
	created_time: string;
	last_edited_time: string;
	url: string;
	properties: Record<string, NotionProperty>;
}

type NotionProperty =
	| { type: 'title'; title: Array<{ plain_text: string }> }
	| { type: 'rich_text'; rich_text: Array<{ plain_text: string }> }
	| { type: 'select'; select: { name: string } | null }
	| { type: 'multi_select'; multi_select: Array<{ name: string }> }
	| { type: 'date'; date: { start: string } | null }
	| { type: 'number'; number: number | null }
	| { type: 'url'; url: string | null };

export interface SearchResult {
	page: NotionPageWithProperties;
	category: Category;
	name: string;
	matchType: 'exact' | 'partial' | 'nickname';
	score: number;
}

function getHeaders(token: string): Record<string, string> {
	return {
		Authorization: `Bearer ${token}`,
		'Content-Type': 'application/json',
		'Notion-Version': NOTION_VERSION,
	};
}

// Extract the name/title from a Notion page
function extractName(page: NotionPageWithProperties): string {
	const titleProp = Object.values(page.properties).find((p) => p.type === 'title') as
		| { type: 'title'; title: Array<{ plain_text: string }> }
		| undefined;
	if (titleProp && titleProp.title.length > 0) {
		return titleProp.title.map((t) => t.plain_text).join('');
	}
	return '';
}

// Extract nicknames from a Person page
function extractNicknames(page: NotionPageWithProperties): string[] {
	const nicknameProp = page.properties['Nicknames'] as { type: 'rich_text'; rich_text: Array<{ plain_text: string }> } | undefined;
	if (nicknameProp && nicknameProp.type === 'rich_text' && nicknameProp.rich_text.length > 0) {
		const text = nicknameProp.rich_text.map((t) => t.plain_text).join('');
		return text.split(',').map((n) => n.trim()).filter((n) => n.length > 0);
	}
	return [];
}

// Calculate similarity score between two strings (0-1)
function calculateSimilarity(str1: string, str2: string): number {
	const s1 = str1.toLowerCase();
	const s2 = str2.toLowerCase();

	// Exact match
	if (s1 === s2) return 1.0;

	// One contains the other
	if (s1.includes(s2) || s2.includes(s1)) {
		const longer = Math.max(s1.length, s2.length);
		const shorter = Math.min(s1.length, s2.length);
		return shorter / longer;
	}

	// Check if words overlap
	const words1 = s1.split(/\s+/);
	const words2 = s2.split(/\s+/);
	const commonWords = words1.filter((w) => words2.some((w2) => w2.includes(w) || w.includes(w2)));

	if (commonWords.length > 0) {
		return commonWords.length / Math.max(words1.length, words2.length) * 0.8;
	}

	return 0;
}

// Query database with property retrieval
async function queryDatabaseWithProperties(
	databaseId: string,
	token: string,
	filter?: Record<string, unknown>
): Promise<NotionPageWithProperties[]> {
	const response = await fetch(`${NOTION_API_URL}/databases/${databaseId}/query`, {
		method: 'POST',
		headers: getHeaders(token),
		body: JSON.stringify({ filter, page_size: 100 }),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Notion API error: ${response.status} - ${errorText}`);
	}

	const data = (await response.json()) as { results: NotionPageWithProperties[] };
	return data.results;
}

// Search by name within a specific category
export async function searchByName(query: string, category: Category, env: Env): Promise<SearchResult[]> {
	const databaseId = getDatabaseId(category, env);
	const token = env.NOTION_TOKEN;

	// Notion filter for title contains
	const filter = {
		property: 'Name',
		title: {
			contains: query,
		},
	};

	const pages = await queryDatabaseWithProperties(databaseId, token, filter);
	const results: SearchResult[] = [];

	for (const page of pages) {
		const name = extractName(page);
		const similarity = calculateSimilarity(query, name);

		if (similarity > 0) {
			results.push({
				page,
				category,
				name,
				matchType: similarity === 1.0 ? 'exact' : 'partial',
				score: similarity,
			});
		}
	}

	// For people, also search by nicknames if no matches found
	if (category === 'person' && results.length === 0) {
		const allPeople = await queryDatabaseWithProperties(databaseId, token);
		for (const page of allPeople) {
			const nicknames = extractNicknames(page);
			for (const nickname of nicknames) {
				const similarity = calculateSimilarity(query, nickname);
				if (similarity > 0.5) {
					results.push({
						page,
						category,
						name: extractName(page),
						matchType: 'nickname',
						score: similarity * 0.9, // Slightly lower score for nickname matches
					});
					break; // Only add once per person
				}
			}
		}
	}

	// Sort by score descending
	return results.sort((a, b) => b.score - a.score);
}

// Search for potential duplicates before filing
export async function searchForDuplicates(name: string, category: Category, env: Env): Promise<SearchResult[]> {
	const results = await searchByName(name, category, env);

	// Filter to only include likely duplicates (score > 0.5)
	return results.filter((r) => r.score > 0.5);
}

// Search across all databases
export async function searchAll(query: string, env: Env): Promise<SearchResult[]> {
	const categories: Category[] = ['person', 'project', 'idea', 'admin'];

	// Search all databases in parallel
	const searchPromises = categories.map((category) => searchByName(query, category, env));
	const resultsArrays = await Promise.all(searchPromises);

	// Flatten and sort by score
	const allResults = resultsArrays.flat();
	return allResults.sort((a, b) => b.score - a.score);
}

// Get recent entries from a category
export async function getRecentEntries(category: Category, days: number, env: Env): Promise<NotionPageWithProperties[]> {
	const databaseId = getDatabaseId(category, env);
	const token = env.NOTION_TOKEN;

	const sinceDate = new Date();
	sinceDate.setDate(sinceDate.getDate() - days);

	// Different databases have different date fields
	const dateProperty = category === 'admin' ? 'Due Date' : category === 'person' ? 'Last Touched' : 'Created';

	const filter = {
		property: dateProperty,
		date: {
			after: sinceDate.toISOString(),
		},
	};

	try {
		return await queryDatabaseWithProperties(databaseId, token, filter);
	} catch {
		// If the date property doesn't exist, return empty
		return [];
	}
}
