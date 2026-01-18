import type { ClassificationResult, ThreadIntent, MessageIntent, ClassificationResult as ClassResult, ThreadMessage } from '../types';
import { CLASSIFICATION_PROMPT, THREAD_INTENT_PROMPT, INTENT_DETECTION_PROMPT, MODEL } from '../prompts';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

interface OpenRouterResponse {
	id: string;
	choices: Array<{
		message: {
			role: string;
			content: string;
			reasoning?: string; // For reasoning models like GLM 4.7
		};
		finish_reason: string;
	}>;
	usage: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

export async function classify(text: string, apiKey: string): Promise<ClassificationResult> {
	const prompt = CLASSIFICATION_PROMPT.replace('{message_text}', text);

	// Add timeout for slow models
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

	console.log('[OpenRouter] Making request to model:', MODEL);

	const response = await fetch(OPENROUTER_API_URL, {
		signal: controller.signal,
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://second-brain.workers.dev',
			'X-Title': 'Second Brain',
		},
		body: JSON.stringify({
			model: MODEL,
			messages: [
				{
					role: 'user',
					content: prompt,
				},
			],
			temperature: 0.1,
			response_format: { type: 'json_object' },
		}),
	});

	clearTimeout(timeoutId);

	if (!response.ok) {
		const errorText = await response.text();
		console.error('[OpenRouter] API error:', response.status, errorText);
		throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
	}

	const data = (await response.json()) as OpenRouterResponse;
	console.log('[OpenRouter] Response:', JSON.stringify(data, null, 2));

	// Handle reasoning models (like GLM 4.7) that return content in 'reasoning' field
	const message = data.choices[0]?.message;
	const content = message?.content || message?.reasoning;

	if (!content) {
		console.error('[OpenRouter] No content in response. Full data:', JSON.stringify(data));
		throw new Error('No content in OpenRouter response');
	}

	console.log('[OpenRouter] Using content:', content);

	const result = JSON.parse(content) as ClassificationResult;

	// Validate required fields
	if (!result.category || typeof result.confidence !== 'number' || !result.name) {
		throw new Error(`Invalid classification result: ${content}`);
	}

	return result;
}

// Detect message intent (capture vs query)
export async function detectMessageIntent(text: string, apiKey: string): Promise<MessageIntent> {
	const prompt = INTENT_DETECTION_PROMPT.replace('{message}', text);

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

	console.log('[OpenRouter] Detecting message intent...');

	const response = await fetch(OPENROUTER_API_URL, {
		signal: controller.signal,
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://second-brain.workers.dev',
			'X-Title': 'Second Brain',
		},
		body: JSON.stringify({
			model: MODEL,
			messages: [{ role: 'user', content: prompt }],
			temperature: 0.1,
			response_format: { type: 'json_object' },
		}),
	});

	clearTimeout(timeoutId);

	if (!response.ok) {
		const errorText = await response.text();
		console.error('[OpenRouter] API error:', response.status, errorText);
		throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
	}

	const data = (await response.json()) as OpenRouterResponse;
	const content = data.choices[0]?.message?.content || data.choices[0]?.message?.reasoning;

	if (!content) {
		throw new Error('No content in OpenRouter response');
	}

	const result = JSON.parse(content) as MessageIntent;

	// Default to capture if intent is unclear
	if (!result.intent || !['capture', 'query'].includes(result.intent)) {
		return { intent: 'capture', confidence: 0.5 };
	}

	return result;
}

// Detect thread reply intent
export async function detectThreadIntent(
	originalMessage: string,
	classification: ClassResult,
	conversationHistory: ThreadMessage[],
	newReply: string,
	apiKey: string
): Promise<ThreadIntent> {
	const historyText = conversationHistory.map((m) => `${m.role === 'user' ? 'User' : 'Bot'}: ${m.content}`).join('\n');

	const prompt = THREAD_INTENT_PROMPT.replace('{original_message}', originalMessage)
		.replace('{category}', classification.category)
		.replace('{name}', classification.name)
		.replace('{fields}', JSON.stringify(classification.fields, null, 2))
		.replace('{conversation_history}', historyText || '(none)')
		.replace('{new_reply}', newReply);

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 30000);

	console.log('[OpenRouter] Detecting thread intent...');

	const response = await fetch(OPENROUTER_API_URL, {
		signal: controller.signal,
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://second-brain.workers.dev',
			'X-Title': 'Second Brain',
		},
		body: JSON.stringify({
			model: MODEL,
			messages: [{ role: 'user', content: prompt }],
			temperature: 0.1,
			response_format: { type: 'json_object' },
		}),
	});

	clearTimeout(timeoutId);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
	}

	const data = (await response.json()) as OpenRouterResponse;
	const content = data.choices[0]?.message?.content || data.choices[0]?.message?.reasoning;

	if (!content) {
		throw new Error('No content in OpenRouter response');
	}

	const result = JSON.parse(content) as ThreadIntent;

	// Validate
	const validIntents = ['correct_category', 'update_field', 'add_context', 'create_related', 'query', 'unclear'];
	if (!result.intent || !validIntents.includes(result.intent)) {
		return { intent: 'unclear', details: {}, confidence: 0.5 };
	}

	return result;
}

// Generate a query response
export async function generateQueryResponse(question: string, searchResults: string, apiKey: string): Promise<string> {
	const { QUERY_PROMPT } = await import('../prompts');
	const prompt = QUERY_PROMPT.replace('{question}', question).replace('{search_results}', searchResults);

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 30000);

	const response = await fetch(OPENROUTER_API_URL, {
		signal: controller.signal,
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://second-brain.workers.dev',
			'X-Title': 'Second Brain',
		},
		body: JSON.stringify({
			model: MODEL,
			messages: [{ role: 'user', content: prompt }],
			temperature: 0.3,
		}),
	});

	clearTimeout(timeoutId);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
	}

	const data = (await response.json()) as OpenRouterResponse;
	const content = data.choices[0]?.message?.content || data.choices[0]?.message?.reasoning;

	return content || "I couldn't generate a response. Please try again.";
}
