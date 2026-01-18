#!/usr/bin/env bun
/**
 * Test script to simulate Slack events locally
 * Run with: bun run scripts/test-local.ts
 */

const WORKER_URL = 'http://localhost:8787';

async function testUrlVerification() {
	console.log('=== Testing URL Verification ===');
	const response = await fetch(`${WORKER_URL}/slack/events`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			type: 'url_verification',
			challenge: 'test-challenge-123',
			token: 'test-token',
		}),
	});

	console.log(`Status: ${response.status}`);
	console.log(`Response: ${await response.text()}`);
	console.log('');
}

async function testMessageEvent(text: string) {
	console.log(`=== Testing Message Event ===`);
	console.log(`Message: "${text}"`);
	console.log('');

	const event = {
		type: 'event_callback',
		token: 'test-token',
		team_id: 'T123456',
		api_app_id: 'A123456',
		event: {
			type: 'message',
			channel: 'C123456',
			user: 'U09LT42A3A6',
			text: text,
			ts: `${Date.now() / 1000}`,
			event_ts: `${Date.now() / 1000}`,
		},
		event_id: `Ev${Date.now()}`,
		event_time: Math.floor(Date.now() / 1000),
	};

	console.log('Sending event:', JSON.stringify(event, null, 2));
	console.log('');

	const response = await fetch(`${WORKER_URL}/slack/events`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		// No signature headers = skip verification in dev mode
		body: JSON.stringify(event),
	});

	console.log(`Status: ${response.status}`);
	console.log(`Response: ${await response.text()}`);
	console.log('');
	console.log('Check the dev server console for processing logs...');
}

async function main() {
	const args = process.argv.slice(2);
	const message = args.join(' ') || 'Met Sarah at the coffee shop - she mentioned she is looking for a frontend developer';

	console.log('Testing Second Brain Worker locally');
	console.log('Make sure `bun dev` is running in another terminal');
	console.log('');

	// Test URL verification first
	await testUrlVerification();

	// Wait a bit
	await new Promise((r) => setTimeout(r, 500));

	// Test message processing
	await testMessageEvent(message);
}

main().catch(console.error);
