// Notion API response types

export interface NotionDatabase {
	id: string;
	object: 'database';
	title: Array<{ plain_text: string }>;
	properties: NotionDatabaseProperties;
}

export interface NotionDatabaseProperties {
	[propertyName: string]: NotionPropertySchema;
}

export interface NotionPropertySchema {
	id: string;
	type: string;
	name: string;
	title?: Record<string, never>;
	rich_text?: Record<string, never>;
	date?: Record<string, never>;
	number?: { format: string };
	select?: { options: Array<{ id: string; name: string; color: string }> };
	multi_select?: { options: Array<{ id: string; name: string; color: string }> };
}

// Notion API request types

export interface NotionPropertyConfig {
	[propertyName: string]: NotionPropertyDefinition;
}

export type NotionPropertyDefinition =
	| { title: Record<string, never> }
	| { rich_text: Record<string, never> }
	| { date: Record<string, never> }
	| { number: { format?: 'number' | 'percent' } }
	| { select: { options: Array<{ name: string }> } }
	| { multi_select: { options: Array<{ name: string }> } };

// Schema definition types

export type NotionPropertyType = 'title' | 'rich_text' | 'date' | 'number' | 'select' | 'multi_select';

export interface PropertyDefinition {
	name: string;
	type: NotionPropertyType;
	options?: string[]; // For select/multi_select
}

export interface DatabaseDefinition {
	key: string; // Environment variable suffix: NOTION_DB_{key}
	title: string; // Human-readable name in Notion
	properties: PropertyDefinition[];
}

// Sync result types

export interface SyncResult {
	databaseId: string;
	status: 'created' | 'updated' | 'unchanged';
	changes: string[];
}

export interface SchemaDiff {
	missingProperties: PropertyDefinition[];
	selectOptionsToAdd: Map<string, string[]>;
	unchanged: string[];
}
