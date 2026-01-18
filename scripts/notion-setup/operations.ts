import type {
	DatabaseDefinition,
	PropertyDefinition,
	NotionPropertyConfig,
	NotionPropertyDefinition,
	NotionDatabaseProperties,
	SyncResult,
	SchemaDiff,
} from './types';
import { getDatabase, createDatabase, updateDatabase } from './api';

/**
 * Convert a property definition to Notion API format.
 */
function propertyToNotion(prop: PropertyDefinition): NotionPropertyDefinition {
	switch (prop.type) {
		case 'title':
			return { title: {} };
		case 'rich_text':
			return { rich_text: {} };
		case 'date':
			return { date: {} };
		case 'number':
			return { number: { format: 'number' } };
		case 'select':
			return { select: { options: (prop.options || []).map((name) => ({ name })) } };
		case 'multi_select':
			return { multi_select: { options: (prop.options || []).map((name) => ({ name })) } };
	}
}

/**
 * Convert schema properties to Notion API format.
 */
export function schemaToNotionProperties(properties: PropertyDefinition[]): NotionPropertyConfig {
	const result: NotionPropertyConfig = {};
	for (const prop of properties) {
		result[prop.name] = propertyToNotion(prop);
	}
	return result;
}

/**
 * Compare desired schema against existing database properties.
 */
export function computeDiff(desiredSchema: PropertyDefinition[], existingProperties: NotionDatabaseProperties): SchemaDiff {
	const missingProperties: PropertyDefinition[] = [];
	const selectOptionsToAdd = new Map<string, string[]>();
	const unchanged: string[] = [];

	for (const prop of desiredSchema) {
		const existing = existingProperties[prop.name];

		if (!existing) {
			// Property doesn't exist - need to add it
			missingProperties.push(prop);
			continue;
		}

		// Property exists - check if types match
		if (existing.type !== prop.type) {
			console.warn(`  Warning: Property "${prop.name}" has type "${existing.type}" but schema wants "${prop.type}". Cannot change types.`);
			continue;
		}

		// For select/multi_select, check if we need to add options
		if ((prop.type === 'select' || prop.type === 'multi_select') && prop.options) {
			const existingOptions = new Set<string>();

			if (prop.type === 'select' && existing.select?.options) {
				existing.select.options.forEach((opt) => existingOptions.add(opt.name));
			} else if (prop.type === 'multi_select' && existing.multi_select?.options) {
				existing.multi_select.options.forEach((opt) => existingOptions.add(opt.name));
			}

			const newOptions = prop.options.filter((opt) => !existingOptions.has(opt));
			if (newOptions.length > 0) {
				selectOptionsToAdd.set(prop.name, newOptions);
			} else {
				unchanged.push(prop.name);
			}
		} else {
			unchanged.push(prop.name);
		}
	}

	return { missingProperties, selectOptionsToAdd, unchanged };
}

/**
 * Sync a single database - create if missing, update properties if needed.
 */
export async function syncDatabase(
	definition: DatabaseDefinition,
	existingId: string | undefined,
	parentPageId: string,
	token: string
): Promise<SyncResult> {
	const changes: string[] = [];

	// If no existing ID, create the database
	if (!existingId) {
		const properties = schemaToNotionProperties(definition.properties);
		const db = await createDatabase(parentPageId, definition.title, properties, token);
		changes.push(`Created database with ${definition.properties.length} properties`);
		return { databaseId: db.id, status: 'created', changes };
	}

	// Get existing database
	const existingDb = await getDatabase(existingId, token);
	if (!existingDb) {
		throw new Error(`Database ${existingId} not found. Remove NOTION_DB_${definition.key} from env to create a new one.`);
	}

	// Compute what needs to change
	const diff = computeDiff(definition.properties, existingDb.properties);

	// If nothing to change, we're done
	if (diff.missingProperties.length === 0 && diff.selectOptionsToAdd.size === 0) {
		return { databaseId: existingId, status: 'unchanged', changes };
	}

	// Build properties update
	const propertiesToUpdate: NotionPropertyConfig = {};

	// Add missing properties
	for (const prop of diff.missingProperties) {
		propertiesToUpdate[prop.name] = propertyToNotion(prop);
		changes.push(`Added property: ${prop.name} (${prop.type})`);
	}

	// Add new select options - need to include ALL options (existing + new)
	for (const [propName, newOptions] of diff.selectOptionsToAdd) {
		const prop = definition.properties.find((p) => p.name === propName);
		if (prop && prop.options) {
			// Use all options from schema (which includes existing + new)
			propertiesToUpdate[propName] = propertyToNotion(prop);
			changes.push(`Added ${prop.type} options to ${propName}: ${newOptions.join(', ')}`);
		}
	}

	// Apply updates
	await updateDatabase(existingId, propertiesToUpdate, token);

	return { databaseId: existingId, status: 'updated', changes };
}
