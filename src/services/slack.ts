import type {
	SlackEvent,
	SlackEventCallback,
	SlackUrlVerification,
	SlackInteractionPayload,
	ButtonPayload,
	SlackBlock,
	SlackBlockElement,
	Category,
} from '../types';

const SLACK_API_URL = 'https://slack.com/api';

// Verify Slack request signature
export async function verifySignature(
	body: string,
	timestamp: string,
	signature: string,
	signingSecret: string
): Promise<boolean> {
	// Check timestamp to prevent replay attacks (within 5 minutes)
	const currentTime = Math.floor(Date.now() / 1000);
	if (Math.abs(currentTime - parseInt(timestamp, 10)) > 60 * 5) {
		return false;
	}

	const sigBaseString = `v0:${timestamp}:${body}`;

	// Create HMAC-SHA256 signature
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
	const computedSignature = 'v0=' + signatureArray.map((b) => b.toString(16).padStart(2, '0')).join('');

	return computedSignature === signature;
}

// Parse Slack event from request body
export function parseSlackEvent(body: string): SlackEvent {
	const event = JSON.parse(body) as SlackEvent;
	return event;
}

// Check if this is a URL verification challenge
export function isUrlVerification(event: SlackEvent): event is SlackUrlVerification {
	return event.type === 'url_verification';
}

// Check if this is an event callback
export function isEventCallback(event: SlackEvent): event is SlackEventCallback {
	return event.type === 'event_callback';
}

// Post a message to a channel (optionally in a thread)
export async function postMessage(
	channel: string,
	text: string,
	token: string,
	threadTs?: string
): Promise<{ ok: boolean; ts?: string; error?: string }> {
	const response = await fetch(`${SLACK_API_URL}/chat.postMessage`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			channel,
			text,
			thread_ts: threadTs,
		}),
	});

	if (!response.ok) {
		throw new Error(`Slack API HTTP error: ${response.status}`);
	}

	return (await response.json()) as { ok: boolean; ts?: string; error?: string };
}

// Send a direct message to a user
export async function sendDM(
	userId: string,
	text: string,
	token: string
): Promise<{ ok: boolean; ts?: string; error?: string }> {
	// First, open a DM channel with the user
	const openResponse = await fetch(`${SLACK_API_URL}/conversations.open`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ users: userId }),
	});

	if (!openResponse.ok) {
		throw new Error(`Slack API HTTP error: ${openResponse.status}`);
	}

	const openData = (await openResponse.json()) as { ok: boolean; channel?: { id: string }; error?: string };
	if (!openData.ok || !openData.channel) {
		throw new Error(`Failed to open DM channel: ${openData.error}`);
	}

	// Then send the message to the DM channel
	return postMessage(openData.channel.id, text, token);
}

// Format a classification confirmation message
export function formatConfirmation(category: string, name: string, confidence: number): string {
	const confidencePercent = Math.round(confidence * 100);
	const categoryCapitalized = category.charAt(0).toUpperCase() + category.slice(1);
	return `Filed as ${categoryCapitalized}: ${name} | Confidence: ${confidencePercent}%`;
}

// Format a low-confidence clarification request
export function formatClarificationRequest(confidence: number): string {
	const confidencePercent = Math.round(confidence * 100);
	return `I'm not sure where this goes (${confidencePercent}% confidence). Is this about a person, project, idea, or admin task?`;
}

// Add a reaction emoji to a message
export async function addReaction(
	channel: string,
	timestamp: string,
	emoji: string, // without colons: 'white_check_mark', '100'
	token: string
): Promise<{ ok: boolean; error?: string }> {
	const response = await fetch(`${SLACK_API_URL}/reactions.add`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			channel,
			timestamp,
			name: emoji,
		}),
	});

	if (!response.ok) {
		throw new Error(`Slack API HTTP error: ${response.status}`);
	}

	const result = (await response.json()) as { ok: boolean; error?: string };

	// Ignore "already_reacted" error - it's fine if we already added this reaction
	if (!result.ok && result.error !== 'already_reacted') {
		console.error(`[Slack] Failed to add reaction: ${result.error}`);
	}

	return result;
}

// --- Button Payload Encoding/Decoding ---

export function encodeButtonPayload(payload: ButtonPayload): string {
	return btoa(JSON.stringify(payload));
}

export function decodeButtonPayload(encoded: string): ButtonPayload {
	return JSON.parse(atob(encoded));
}

// --- Block Kit Message Builders ---

export function buildCategorySelectionBlocks(
	confidence: number,
	threadTs: string,
	channel: string
): { blocks: SlackBlock[]; text: string } {
	const confidencePercent = Math.round(confidence * 100);
	const categories: Category[] = ['person', 'project', 'idea', 'admin'];

	const elements: SlackBlockElement[] = categories.map((cat) => ({
		type: 'button' as const,
		text: { type: 'plain_text' as const, text: cat.charAt(0).toUpperCase() + cat.slice(1) },
		action_id: `sb_cat_${cat}`,
		value: encodeButtonPayload({
			action: 'category_select',
			threadTs,
			channel,
			data: { category: cat },
		}),
	}));

	return {
		blocks: [
			{
				type: 'section',
				text: {
					type: 'mrkdwn',
					text: `I'm not sure where this goes (${confidencePercent}% confidence). What type of entry is this?`,
				},
			},
			{
				type: 'actions',
				block_id: 'category_select',
				elements,
			},
		],
		text: formatClarificationRequest(confidence), // Fallback for notifications
	};
}

export function buildDuplicateResolutionBlocks(
	category: string,
	duplicateName: string,
	threadTs: string,
	channel: string
): { blocks: SlackBlock[]; text: string } {
	return {
		blocks: [
			{
				type: 'section',
				text: {
					type: 'mrkdwn',
					text: `I found an existing ${category}: "*${duplicateName}*"\n\nShould I update that one, or create a new entry?`,
				},
			},
			{
				type: 'actions',
				block_id: 'duplicate_resolve',
				elements: [
					{
						type: 'button',
						text: { type: 'plain_text', text: 'Update Existing' },
						action_id: 'sb_dup_update',
						value: encodeButtonPayload({
							action: 'duplicate_resolve',
							threadTs,
							channel,
							data: { resolution: 'update' },
						}),
						style: 'primary',
					},
					{
						type: 'button',
						text: { type: 'plain_text', text: 'Create New' },
						action_id: 'sb_dup_new',
						value: encodeButtonPayload({
							action: 'duplicate_resolve',
							threadTs,
							channel,
							data: { resolution: 'new' },
						}),
					},
				],
			},
		],
		text: `I found an existing ${category}: "${duplicateName}". Reply "update" or "new".`,
	};
}

export function buildThreadOptionsBlocks(
	threadTs: string,
	channel: string,
	hasDuplicate: boolean
): { blocks: SlackBlock[]; text: string } {
	const elements: SlackBlockElement[] = [
		{
			type: 'button',
			text: { type: 'plain_text', text: 'Change Category' },
			action_id: 'sb_opt_category',
			value: encodeButtonPayload({
				action: 'thread_option',
				threadTs,
				channel,
				data: { option: 'change_category' },
			}),
		},
		{
			type: 'button',
			text: { type: 'plain_text', text: 'Edit Fields' },
			action_id: 'sb_opt_fields',
			value: encodeButtonPayload({
				action: 'thread_option',
				threadTs,
				channel,
				data: { option: 'edit_fields' },
			}),
		},
		{
			type: 'button',
			text: { type: 'plain_text', text: 'Add Context' },
			action_id: 'sb_opt_context',
			value: encodeButtonPayload({
				action: 'thread_option',
				threadTs,
				channel,
				data: { option: 'add_context' },
			}),
		},
	];

	if (hasDuplicate) {
		elements.push(
			{
				type: 'button',
				text: { type: 'plain_text', text: 'Update Existing' },
				action_id: 'sb_dup_update',
				value: encodeButtonPayload({
					action: 'duplicate_resolve',
					threadTs,
					channel,
					data: { resolution: 'update' },
				}),
			},
			{
				type: 'button',
				text: { type: 'plain_text', text: 'Create New' },
				action_id: 'sb_dup_new',
				value: encodeButtonPayload({
					action: 'duplicate_resolve',
					threadTs,
					channel,
					data: { resolution: 'new' },
				}),
			}
		);
	}

	return {
		blocks: [
			{
				type: 'section',
				text: { type: 'mrkdwn', text: "I'm not sure what you'd like me to do. What would you like to change?" },
			},
			{ type: 'actions', block_id: 'thread_options', elements },
		],
		text: "I'm not sure what you'd like me to do. You can: change category, update a field, or add info.",
	};
}

// --- Message Posting with Blocks ---

export async function postMessageWithBlocks(
	channel: string,
	blocks: SlackBlock[],
	fallbackText: string,
	token: string,
	threadTs?: string
): Promise<{ ok: boolean; ts?: string; error?: string }> {
	const response = await fetch(`${SLACK_API_URL}/chat.postMessage`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			channel,
			blocks,
			text: fallbackText,
			thread_ts: threadTs,
		}),
	});

	if (!response.ok) {
		throw new Error(`Slack API HTTP error: ${response.status}`);
	}

	return (await response.json()) as { ok: boolean; ts?: string; error?: string };
}

// --- Update Message (for button click response) ---

export async function updateMessage(
	channel: string,
	ts: string,
	text: string,
	token: string,
	blocks?: SlackBlock[]
): Promise<{ ok: boolean; error?: string }> {
	const body: Record<string, unknown> = { channel, ts, text };
	if (blocks) {
		body.blocks = blocks;
	}

	const response = await fetch(`${SLACK_API_URL}/chat.update`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		throw new Error(`Slack API HTTP error: ${response.status}`);
	}

	return (await response.json()) as { ok: boolean; error?: string };
}

// --- Respond to Interaction (via response_url) ---

export async function respondToInteraction(responseUrl: string, text: string, replaceOriginal: boolean = false): Promise<void> {
	await fetch(responseUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			text,
			replace_original: replaceOriginal,
			response_type: 'in_channel',
		}),
	});
}

// --- Parse Interaction Payload ---

export function parseInteractionPayload(body: string): SlackInteractionPayload {
	// Slack sends interactions as URL-encoded form data with payload field
	const params = new URLSearchParams(body);
	const payloadStr = params.get('payload');
	if (!payloadStr) {
		throw new Error('Missing payload in interaction request');
	}
	return JSON.parse(payloadStr);
}
