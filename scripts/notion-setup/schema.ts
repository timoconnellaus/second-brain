import type { DatabaseDefinition } from './types';

/**
 * Notion database schema definitions.
 * This is the single source of truth for the database structure.
 * Property names must match those used in src/services/notion.ts
 */
export const NOTION_SCHEMA: DatabaseDefinition[] = [
	{
		key: 'PEOPLE',
		title: 'People',
		properties: [
			{ name: 'Name', type: 'title' },
			{ name: 'Nicknames', type: 'rich_text' },
			{ name: 'Context', type: 'rich_text' },
			{ name: 'Follow-ups', type: 'rich_text' },
			{ name: 'Last Touched', type: 'date' },
			{ name: 'Tags', type: 'multi_select' },
		],
	},
	{
		key: 'PROJECTS',
		title: 'Projects',
		properties: [
			{ name: 'Name', type: 'title' },
			{ name: 'Next Action', type: 'rich_text' },
			{ name: 'Notes', type: 'rich_text' },
			{ name: 'Status', type: 'select', options: ['active', 'waiting', 'blocked', 'someday', 'done'] },
		],
	},
	{
		key: 'IDEAS',
		title: 'Ideas',
		properties: [
			{ name: 'Name', type: 'title' },
			{ name: 'One-liner', type: 'rich_text' },
			{ name: 'Notes', type: 'rich_text' },
			{ name: 'Tags', type: 'multi_select' },
		],
	},
	{
		key: 'ADMIN',
		title: 'Admin',
		properties: [
			{ name: 'Name', type: 'title' },
			{ name: 'Due Date', type: 'date' },
			{ name: 'Status', type: 'select', options: ['pending', 'done'] },
		],
	},
	{
		key: 'INBOX_LOG',
		title: 'Inbox Log',
		properties: [
			{ name: 'Record Name', type: 'title' },
			{ name: 'Captured Text', type: 'rich_text' },
			{ name: 'Confidence', type: 'number' },
			{ name: 'Created', type: 'date' },
			{ name: 'Destination', type: 'select', options: ['person', 'project', 'idea', 'admin', 'needs_review'] },
		],
	},
];
