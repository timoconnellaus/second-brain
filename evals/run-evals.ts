#!/usr/bin/env bun
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import prompt config
import { CLASSIFICATION_PROMPT, MODEL } from '../src/prompts';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

interface TestCase {
	id: string;
	input: string;
	expected: {
		category?: string;
		confidence?: { min?: number; max?: number };
		name?: string | { contains: string };
		fields?: Record<string, unknown>;
	};
}

interface CaseFile {
	description: string;
	cases: TestCase[];
}

interface CachedResult {
	input: string;
	output: Record<string, unknown>;
	timestamp: string;
}

interface CacheFile {
	hash: string;
	prompt_version: string;
	model: string;
	results: Record<string, CachedResult>;
}

// Compute hash of prompt + model config
function computeConfigHash(): string {
	const configString = JSON.stringify({ prompt: CLASSIFICATION_PROMPT, model: MODEL });
	return createHash('sha256').update(configString).digest('hex').slice(0, 16);
}

// Compute hash of input for cache key
function computeInputHash(input: string): string {
	return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

// Load or create cache file
function loadCache(configHash: string): CacheFile {
	const cachePath = join(__dirname, 'cache', `${configHash}.json`);

	if (existsSync(cachePath)) {
		return JSON.parse(readFileSync(cachePath, 'utf-8'));
	}

	return {
		hash: configHash,
		prompt_version: 'v1',
		model: MODEL,
		results: {},
	};
}

// Save cache file
function saveCache(cache: CacheFile): void {
	const cacheDir = join(__dirname, 'cache');
	if (!existsSync(cacheDir)) {
		mkdirSync(cacheDir, { recursive: true });
	}

	const cachePath = join(cacheDir, `${cache.hash}.json`);
	writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

// Call OpenRouter API
async function callOpenRouter(input: string, apiKey: string): Promise<Record<string, unknown>> {
	const prompt = CLASSIFICATION_PROMPT.replace('{message_text}', input);

	const response = await fetch(OPENROUTER_API_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://second-brain.workers.dev',
			'X-Title': 'Second Brain Evals',
		},
		body: JSON.stringify({
			model: MODEL,
			messages: [{ role: 'user', content: prompt }],
			temperature: 0.1,
			response_format: { type: 'json_object' },
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
	}

	const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
	const content = data.choices[0]?.message?.content;

	if (!content) {
		throw new Error('No content in OpenRouter response');
	}

	return JSON.parse(content);
}

// Check if a value matches expected
function matchesExpected(actual: unknown, expected: unknown): { pass: boolean; reason?: string } {
	if (expected === undefined || expected === null) {
		return { pass: true };
	}

	if (typeof expected === 'object' && expected !== null) {
		// Handle special matchers
		if ('min' in expected && typeof actual === 'number') {
			const min = (expected as { min: number }).min;
			if (actual < min) {
				return { pass: false, reason: `expected >= ${min}, got ${actual}` };
			}
			return { pass: true };
		}

		if ('max' in expected && typeof actual === 'number') {
			const max = (expected as { max: number }).max;
			if (actual > max) {
				return { pass: false, reason: `expected <= ${max}, got ${actual}` };
			}
			return { pass: true };
		}

		if ('contains' in expected && typeof actual === 'string') {
			const contains = (expected as { contains: string }).contains.toLowerCase();
			if (!actual.toLowerCase().includes(contains)) {
				return { pass: false, reason: `expected to contain "${contains}", got "${actual}"` };
			}
			return { pass: true };
		}

		// Nested object comparison
		if (typeof actual === 'object' && actual !== null) {
			for (const [key, value] of Object.entries(expected)) {
				const result = matchesExpected((actual as Record<string, unknown>)[key], value);
				if (!result.pass) {
					return { pass: false, reason: `${key}: ${result.reason}` };
				}
			}
			return { pass: true };
		}
	}

	// Direct comparison
	if (actual !== expected) {
		return { pass: false, reason: `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}` };
	}

	return { pass: true };
}

// Run a single test case
async function runTestCase(
	testCase: TestCase,
	cache: CacheFile,
	apiKey: string,
	forceRefresh: boolean
): Promise<{ pass: boolean; reasons: string[]; cached: boolean }> {
	const inputHash = computeInputHash(testCase.input);
	let output: Record<string, unknown>;
	let cached = false;

	// Check cache
	if (!forceRefresh && cache.results[inputHash]) {
		output = cache.results[inputHash].output;
		cached = true;
	} else {
		// Call API
		output = await callOpenRouter(testCase.input, apiKey);

		// Update cache
		cache.results[inputHash] = {
			input: testCase.input,
			output,
			timestamp: new Date().toISOString(),
		};
	}

	// Check expected values
	const reasons: string[] = [];
	let pass = true;

	if (testCase.expected.category !== undefined) {
		const result = matchesExpected(output.category, testCase.expected.category);
		if (!result.pass) {
			pass = false;
			reasons.push(`category: ${result.reason}`);
		}
	}

	if (testCase.expected.confidence !== undefined) {
		const result = matchesExpected(output.confidence, testCase.expected.confidence);
		if (!result.pass) {
			pass = false;
			reasons.push(`confidence: ${result.reason}`);
		}
	}

	if (testCase.expected.name !== undefined) {
		const result = matchesExpected(output.name, testCase.expected.name);
		if (!result.pass) {
			pass = false;
			reasons.push(`name: ${result.reason}`);
		}
	}

	if (testCase.expected.fields !== undefined) {
		const result = matchesExpected(output.fields, testCase.expected.fields);
		if (!result.pass) {
			pass = false;
			reasons.push(`fields: ${result.reason}`);
		}
	}

	return { pass, reasons, cached };
}

// Main
async function main() {
	const args = process.argv.slice(2);
	const forceRefresh = args.includes('--force');
	const caseFilter = args.find((arg: string) => arg.startsWith('--case='))?.split('=')[1];

	// Check for API key
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) {
		console.error('Error: OPENROUTER_API_KEY environment variable not set');
		console.error('Set it with: export OPENROUTER_API_KEY=your-key');
		process.exit(1);
	}

	// Compute config hash
	const configHash = computeConfigHash();
	console.log(`Config hash: ${configHash}`);
	console.log(`Model: ${MODEL}`);
	console.log(`Force refresh: ${forceRefresh}`);
	console.log('');

	// Load cache
	const cache = loadCache(configHash);
	const cachedCount = Object.keys(cache.results).length;
	console.log(`Cached results: ${cachedCount}`);
	console.log('');

	// Load test cases
	const casesPath = join(__dirname, 'cases', 'classification.json');
	const caseFile: CaseFile = JSON.parse(readFileSync(casesPath, 'utf-8'));

	let cases = caseFile.cases;
	if (caseFilter) {
		cases = cases.filter((c) => c.id.includes(caseFilter) || c.input.toLowerCase().includes(caseFilter.toLowerCase()));
		console.log(`Filtered to ${cases.length} case(s) matching "${caseFilter}"`);
		console.log('');
	}

	// Run tests
	let passed = 0;
	let failed = 0;
	let apiCalls = 0;

	for (const testCase of cases) {
		process.stdout.write(`Running: ${testCase.id}... `);

		try {
			const result = await runTestCase(testCase, cache, apiKey, forceRefresh);

			if (!result.cached) {
				apiCalls++;
			}

			if (result.pass) {
				passed++;
				console.log(`\x1b[32mPASS\x1b[0m${result.cached ? ' (cached)' : ''}`);
			} else {
				failed++;
				console.log(`\x1b[31mFAIL\x1b[0m${result.cached ? ' (cached)' : ''}`);
				for (const reason of result.reasons) {
					console.log(`  - ${reason}`);
				}
			}
		} catch (error) {
			failed++;
			console.log(`\x1b[31mERROR\x1b[0m`);
			console.log(`  - ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	// Save cache
	saveCache(cache);

	// Summary
	console.log('');
	console.log('---');
	console.log(`Results: ${passed} passed, ${failed} failed`);
	console.log(`API calls: ${apiCalls}`);

	process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
	console.error('Fatal error:', error);
	process.exit(1);
});
