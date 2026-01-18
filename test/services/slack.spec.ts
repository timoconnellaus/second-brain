import { fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import {
	verifySignature,
	parseSlackEvent,
	isUrlVerification,
	isEventCallback,
	postMessage,
	sendDM,
	formatConfirmation,
	formatClarificationRequest,
	encodeButtonPayload,
	decodeButtonPayload,
	buildCategorySelectionBlocks,
	buildDuplicateResolutionBlocks,
	buildThreadOptionsBlocks,
	parseInteractionPayload,
	postMessageWithBlocks,
	respondToInteraction,
} from '../../src/services/slack';
import type { ButtonPayload } from '../../src/types';

describe('Slack service', () => {
	beforeAll(() => {
		fetchMock.activate();
		fetchMock.disableNetConnect();
	});

	afterEach(() => {
		fetchMock.assertNoPendingInterceptors();
	});

	describe('verifySignature', () => {
		it('returns true for valid signature', async () => {
			const body = '{"type":"url_verification","challenge":"test"}';
			const timestamp = Math.floor(Date.now() / 1000).toString();
			const signingSecret = 'test-secret';

			// Compute expected signature
			const sigBaseString = `v0:${timestamp}:${body}`;
			const encoder = new TextEncoder();
			const key = await crypto.subtle.importKey(
				'raw',
				encoder.encode(signingSecret),
				{ name: 'HMAC', hash: 'SHA-256' },
				false,
				['sign']
			);
			const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(sigBaseString));
			const signatureArray = Array.from(new Uint8Array(signatureBuffer));
			const signature = 'v0=' + signatureArray.map((b) => b.toString(16).padStart(2, '0')).join('');

			const result = await verifySignature(body, timestamp, signature, signingSecret);
			expect(result).toBe(true);
		});

		it('returns false for invalid signature', async () => {
			const body = '{"type":"url_verification","challenge":"test"}';
			const timestamp = Math.floor(Date.now() / 1000).toString();

			const result = await verifySignature(body, timestamp, 'v0=invalid', 'test-secret');
			expect(result).toBe(false);
		});

		it('returns false for old timestamp', async () => {
			const body = '{"type":"url_verification","challenge":"test"}';
			const oldTimestamp = (Math.floor(Date.now() / 1000) - 60 * 10).toString(); // 10 minutes ago

			const result = await verifySignature(body, oldTimestamp, 'v0=anything', 'test-secret');
			expect(result).toBe(false);
		});
	});

	describe('parseSlackEvent', () => {
		it('parses url_verification event', () => {
			const body = JSON.stringify({
				type: 'url_verification',
				challenge: 'test-challenge',
				token: 'test-token',
			});

			const event = parseSlackEvent(body);
			expect(event.type).toBe('url_verification');
			expect(isUrlVerification(event)).toBe(true);
			if (isUrlVerification(event)) {
				expect(event.challenge).toBe('test-challenge');
			}
		});

		it('parses event_callback event', () => {
			const body = JSON.stringify({
				type: 'event_callback',
				token: 'test-token',
				team_id: 'T123',
				event: {
					type: 'message',
					channel: 'C123',
					user: 'U123',
					text: 'Hello world',
					ts: '1234567890.123456',
					event_ts: '1234567890.123456',
				},
				event_id: 'Ev123',
				event_time: 1234567890,
			});

			const event = parseSlackEvent(body);
			expect(event.type).toBe('event_callback');
			expect(isEventCallback(event)).toBe(true);
			if (isEventCallback(event)) {
				expect(event.event.text).toBe('Hello world');
			}
		});
	});

	describe('postMessage', () => {
		it('posts a message to a channel', async () => {
			fetchMock
				.get('https://slack.com')
				.intercept({ path: '/api/chat.postMessage', method: 'POST' })
				.reply(200, { ok: true, ts: '1234567890.123456' }, { headers: { 'Content-Type': 'application/json' } });

			const result = await postMessage('C123', 'Hello world', 'test-token');
			expect(result.ok).toBe(true);
			expect(result.ts).toBe('1234567890.123456');
		});

		it('posts a threaded message', async () => {
			fetchMock
				.get('https://slack.com')
				.intercept({ path: '/api/chat.postMessage', method: 'POST' })
				.reply(200, { ok: true, ts: '1234567890.999999' }, { headers: { 'Content-Type': 'application/json' } });

			const result = await postMessage('C123', 'Reply', 'test-token', '1234567890.123456');
			expect(result.ok).toBe(true);
		});

		it('throws on HTTP error', async () => {
			fetchMock.get('https://slack.com').intercept({ path: '/api/chat.postMessage', method: 'POST' }).reply(500, 'Error');

			await expect(postMessage('C123', 'Hello', 'test-token')).rejects.toThrow('Slack API HTTP error: 500');
		});
	});

	describe('sendDM', () => {
		it('sends a direct message', async () => {
			// Mock conversations.open
			fetchMock
				.get('https://slack.com')
				.intercept({ path: '/api/conversations.open', method: 'POST' })
				.reply(200, { ok: true, channel: { id: 'D123' } }, { headers: { 'Content-Type': 'application/json' } });

			// Mock chat.postMessage
			fetchMock
				.get('https://slack.com')
				.intercept({ path: '/api/chat.postMessage', method: 'POST' })
				.reply(200, { ok: true, ts: '1234567890.123456' }, { headers: { 'Content-Type': 'application/json' } });

			const result = await sendDM('U123', 'Hello', 'test-token');
			expect(result.ok).toBe(true);
		});

		it('throws if DM channel fails to open', async () => {
			fetchMock
				.get('https://slack.com')
				.intercept({ path: '/api/conversations.open', method: 'POST' })
				.reply(200, { ok: false, error: 'user_not_found' }, { headers: { 'Content-Type': 'application/json' } });

			await expect(sendDM('U123', 'Hello', 'test-token')).rejects.toThrow('Failed to open DM channel: user_not_found');
		});
	});

	describe('formatConfirmation', () => {
		it('formats confirmation message', () => {
			const message = formatConfirmation('person', 'Sarah', 0.92);
			expect(message).toBe('Filed as Person: Sarah | Confidence: 92%');
		});
	});

	describe('formatClarificationRequest', () => {
		it('formats clarification request', () => {
			const message = formatClarificationRequest(0.45);
			expect(message).toBe(
				"I'm not sure where this goes (45% confidence). Is this about a person, project, idea, or admin task?"
			);
		});
	});

	describe('Button payload encoding', () => {
		it('encodes and decodes payload correctly', () => {
			const payload: ButtonPayload = {
				action: 'category_select',
				threadTs: '1234567890.123456',
				channel: 'C123',
				data: { category: 'project' },
			};

			const encoded = encodeButtonPayload(payload);
			expect(typeof encoded).toBe('string');
			expect(encoded.length).toBeGreaterThan(0);

			const decoded = decodeButtonPayload(encoded);
			expect(decoded).toEqual(payload);
		});

		it('handles duplicate_resolve action', () => {
			const payload: ButtonPayload = {
				action: 'duplicate_resolve',
				threadTs: '1234567890.123456',
				channel: 'C123',
				data: { resolution: 'update' },
			};

			const encoded = encodeButtonPayload(payload);
			const decoded = decodeButtonPayload(encoded);
			expect(decoded).toEqual(payload);
		});

		it('handles thread_option action', () => {
			const payload: ButtonPayload = {
				action: 'thread_option',
				threadTs: '1234567890.123456',
				channel: 'C123',
				data: { option: 'change_category' },
			};

			const encoded = encodeButtonPayload(payload);
			const decoded = decodeButtonPayload(encoded);
			expect(decoded).toEqual(payload);
		});
	});

	describe('buildCategorySelectionBlocks', () => {
		it('creates 4 category buttons', () => {
			const { blocks, text } = buildCategorySelectionBlocks(0.45, '123.456', 'C123');

			expect(blocks).toHaveLength(2);
			expect(blocks[0].type).toBe('section');
			expect(blocks[0].text?.text).toContain('45%');

			expect(blocks[1].type).toBe('actions');
			expect(blocks[1].elements).toHaveLength(4);

			const buttonTexts = blocks[1].elements!.map((e) => e.text.text);
			expect(buttonTexts).toEqual(['Person', 'Project', 'Idea', 'Admin']);

			// Each button should have an encoded payload
			for (const element of blocks[1].elements!) {
				const payload = decodeButtonPayload(element.value);
				expect(payload.action).toBe('category_select');
				expect(payload.threadTs).toBe('123.456');
				expect(payload.channel).toBe('C123');
			}

			expect(text).toContain('45%');
		});
	});

	describe('buildDuplicateResolutionBlocks', () => {
		it('creates update and new buttons', () => {
			const { blocks, text } = buildDuplicateResolutionBlocks('person', 'Sarah', '123.456', 'C123');

			expect(blocks).toHaveLength(2);
			expect(blocks[0].type).toBe('section');
			expect(blocks[0].text?.text).toContain('Sarah');
			expect(blocks[0].text?.text).toContain('person');

			expect(blocks[1].type).toBe('actions');
			expect(blocks[1].elements).toHaveLength(2);
			expect(blocks[1].elements![0].text.text).toBe('Update Existing');
			expect(blocks[1].elements![0].style).toBe('primary');
			expect(blocks[1].elements![1].text.text).toBe('Create New');

			// Check payloads
			const updatePayload = decodeButtonPayload(blocks[1].elements![0].value);
			expect(updatePayload.data.resolution).toBe('update');

			const newPayload = decodeButtonPayload(blocks[1].elements![1].value);
			expect(newPayload.data.resolution).toBe('new');

			expect(text).toContain('Sarah');
		});
	});

	describe('buildThreadOptionsBlocks', () => {
		it('creates option buttons without duplicate options', () => {
			const { blocks, text } = buildThreadOptionsBlocks('123.456', 'C123', false);

			expect(blocks).toHaveLength(2);
			expect(blocks[1].elements).toHaveLength(3);

			const buttonTexts = blocks[1].elements!.map((e) => e.text.text);
			expect(buttonTexts).toEqual(['Change Category', 'Edit Fields', 'Add Context']);
		});

		it('adds duplicate buttons when hasDuplicate is true', () => {
			const { blocks } = buildThreadOptionsBlocks('123.456', 'C123', true);

			expect(blocks[1].elements).toHaveLength(5);

			const buttonTexts = blocks[1].elements!.map((e) => e.text.text);
			expect(buttonTexts).toContain('Update Existing');
			expect(buttonTexts).toContain('Create New');
		});
	});

	describe('parseInteractionPayload', () => {
		it('parses URL-encoded form data', () => {
			const payload = {
				type: 'block_actions',
				user: { id: 'U123', username: 'test' },
				actions: [{ action_id: 'sb_cat_person', value: 'test', type: 'button', block_id: 'cat', action_ts: '123' }],
				response_url: 'https://slack.com/response',
				trigger_id: 'trigger123',
			};

			const body = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
			const parsed = parseInteractionPayload(body);

			expect(parsed.type).toBe('block_actions');
			expect(parsed.actions[0].action_id).toBe('sb_cat_person');
			expect(parsed.response_url).toBe('https://slack.com/response');
		});

		it('throws on missing payload', () => {
			expect(() => parseInteractionPayload('')).toThrow('Missing payload');
			expect(() => parseInteractionPayload('foo=bar')).toThrow('Missing payload');
		});
	});

	describe('postMessageWithBlocks', () => {
		it('posts a message with blocks', async () => {
			fetchMock
				.get('https://slack.com')
				.intercept({ path: '/api/chat.postMessage', method: 'POST' })
				.reply(200, { ok: true, ts: '1234567890.123456' }, { headers: { 'Content-Type': 'application/json' } });

			const { blocks, text } = buildCategorySelectionBlocks(0.45, '123.456', 'C123');
			const result = await postMessageWithBlocks('C123', blocks, text, 'test-token');

			expect(result.ok).toBe(true);
			expect(result.ts).toBe('1234567890.123456');
		});
	});

	describe('respondToInteraction', () => {
		it('responds to interaction via response_url', async () => {
			fetchMock
				.get('https://hooks.slack.com')
				.intercept({ path: '/response/123', method: 'POST' })
				.reply(200, { ok: true }, { headers: { 'Content-Type': 'application/json' } });

			await respondToInteraction('https://hooks.slack.com/response/123', 'Done!', true);
			// If no error thrown, the test passes
		});
	});
});
