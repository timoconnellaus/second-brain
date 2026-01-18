#!/usr/bin/env bun

import { NOTION_SCHEMA } from './notion-setup/schema';
import { syncDatabase } from './notion-setup/operations';
import type { SyncResult } from './notion-setup/types';

async function main() {
	console.log('Notion Database Setup');
	console.log('=====================\n');

	// Load environment variables
	const token = process.env.NOTION_TOKEN;
	const parentPageId = process.env.NOTION_PARENT_PAGE_ID;

	// Validate required vars
	if (!token) {
		console.error('Error: NOTION_TOKEN is required');
		console.error('Set it in your environment or .dev.vars file');
		process.exit(1);
	}

	// Build map of existing database IDs from env vars
	const existingDatabases: Record<string, string | undefined> = {};
	for (const db of NOTION_SCHEMA) {
		existingDatabases[db.key] = process.env[`NOTION_DB_${db.key}`];
	}

	// Check if any databases need creation
	const needsCreation = NOTION_SCHEMA.some((db) => !existingDatabases[db.key]);
	if (needsCreation && !parentPageId) {
		console.error('Error: NOTION_PARENT_PAGE_ID is required when creating databases');
		console.error('');
		console.error('Missing database IDs:');
		for (const db of NOTION_SCHEMA) {
			if (!existingDatabases[db.key]) {
				console.error(`  - NOTION_DB_${db.key}`);
			}
		}
		console.error('');
		console.error('Either set the missing database IDs, or provide NOTION_PARENT_PAGE_ID to create them.');
		process.exit(1);
	}

	// Process each database
	const results: Record<string, SyncResult> = {};
	const newDatabaseIds: Record<string, string> = {};
	const failedDatabases: string[] = [];

	for (const definition of NOTION_SCHEMA) {
		console.log(`Processing ${definition.title}...`);

		try {
			const result = await syncDatabase(definition, existingDatabases[definition.key], parentPageId!, token);

			results[definition.key] = result;

			if (result.status === 'created') {
				newDatabaseIds[`NOTION_DB_${definition.key}`] = result.databaseId;
			}

			// Print status
			console.log(`  Status: ${result.status}`);
			if (result.changes.length > 0) {
				result.changes.forEach((change) => console.log(`  - ${change}`));
			}
		} catch (error) {
			console.error(`  Error: ${error instanceof Error ? error.message : String(error)}`);
			failedDatabases.push(definition.key);
		}

		console.log('');
	}

	// Output new database IDs if any were created
	if (Object.keys(newDatabaseIds).length > 0) {
		console.log('=== New Database IDs ===');
		console.log('Add these to your environment variables:\n');
		for (const [key, id] of Object.entries(newDatabaseIds)) {
			console.log(`${key}=${id}`);
		}
		console.log('');
	}

	// Summary
	const created = Object.values(results).filter((r) => r.status === 'created').length;
	const updated = Object.values(results).filter((r) => r.status === 'updated').length;
	const unchanged = Object.values(results).filter((r) => r.status === 'unchanged').length;

	console.log('=== Summary ===');
	console.log(`Created: ${created}, Updated: ${updated}, Unchanged: ${unchanged}, Failed: ${failedDatabases.length}`);

	if (failedDatabases.length > 0) {
		console.error(`\nFailed databases: ${failedDatabases.join(', ')}`);
		process.exit(1);
	}

	console.log('\nSetup complete!');
}

main().catch((error) => {
	console.error('Unexpected error:', error);
	process.exit(1);
});
