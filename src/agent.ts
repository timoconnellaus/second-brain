import { DurableObject } from 'cloudflare:workers';
import type {
	AgentState,
	SlackEvent,
	SlackEventCallback,
	SlackInteractionPayload,
	ButtonPayload,
	ClassificationResult,
	Category,
	ThreadMessage,
	SlackFile,
} from './types';
import { classify, detectThreadIntent, detectMessageIntent, generateQueryResponse } from './services/openrouter';
import {
	createPerson,
	createProject,
	createIdea,
	createAdmin,
	createInboxLog,
	getDatabaseId,
	queryDatabase,
	updatePage,
} from './services/notion';
import { searchForDuplicates, type SearchResult } from './services/search';
import { downloadSlackFile, transcribeAudio, isAudioFile } from './services/transcription';
import {
	verifySignature,
	parseSlackEvent,
	isUrlVerification,
	isEventCallback,
	postMessage,
	sendDM,
	formatConfirmation,
	formatClarificationRequest,
	addReaction,
	parseInteractionPayload,
	decodeButtonPayload,
	respondToInteraction,
	postMessageWithBlocks,
	buildCategorySelectionBlocks,
	buildDuplicateResolutionBlocks,
	buildThreadOptionsBlocks,
} from './services/slack';
import { CONFIDENCE_THRESHOLD } from './prompts';

export class SecondBrainAgent extends DurableObject<Env> {
	private state: AgentState = {
		threadContexts: {},
	};

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		// Load persisted state
		this.ctx.blockConcurrencyWhile(async () => {
			const stored = await this.ctx.storage.get<AgentState>('state');
			if (stored) {
				this.state = stored;
			}
			// Setup alarms for scheduled tasks
			const alarm = await this.ctx.storage.getAlarm();
			if (!alarm) {
				// Set next alarm - check every hour
				await this.ctx.storage.setAlarm(Date.now() + 60 * 60 * 1000);
			}
		});
	}

	private async updateState(newState: AgentState): Promise<void> {
		this.state = newState;
		await this.ctx.storage.put('state', this.state);
	}

	async alarm(): Promise<void> {
		const now = new Date();
		const hour = now.getUTCHours();
		const dayOfWeek = now.getUTCDay();

		// Daily digest at 6am UTC
		if (hour === 6) {
			await this.dailyDigest();
		}

		// Weekly review Sunday at 4pm UTC
		if (dayOfWeek === 0 && hour === 16) {
			await this.weeklyReview();
		}

		// Set next alarm
		await this.ctx.storage.setAlarm(Date.now() + 60 * 60 * 1000);
	}

	async fetch(request: Request): Promise<Response> {
		console.log('[Agent] fetch() called, method:', request.method);

		// Handle Slack webhook events
		if (request.method !== 'POST') {
			return new Response('Method not allowed', { status: 405 });
		}

		const body = await request.text();
		console.log('[Agent] Request body:', body);

		// Check if this is an interaction (button click)
		const isInteraction = request.headers.get('x-slack-interaction') === 'true';

		// Verify Slack signature (REQUIRED for security)
		const timestamp = request.headers.get('x-slack-request-timestamp');
		const signature = request.headers.get('x-slack-signature');

		if (!timestamp || !signature) {
			console.error('[Agent] Missing signature headers - rejecting request');
			return new Response('Missing signature headers', { status: 401 });
		}

		const isValid = await verifySignature(body, timestamp, signature, this.env.SLACK_SIGNING_SECRET);
		if (!isValid) {
			console.error('[Agent] Invalid signature - rejecting request');
			return new Response('Invalid signature', { status: 401 });
		}

		// Route to interaction handler if this is a button click
		if (isInteraction) {
			console.log('[Agent] Handling Slack interaction (button click)...');
			// Respond immediately, process asynchronously
			const response = new Response('OK', { status: 200 });
			this.ctx.waitUntil(this.handleSlackInteraction(body));
			return response;
		}

		// Parse event
		let event: SlackEvent;
		try {
			event = parseSlackEvent(body);
			console.log('[Agent] Parsed event type:', event.type);
		} catch (e) {
			console.error('[Agent] Failed to parse JSON:', e);
			return new Response('Invalid JSON', { status: 400 });
		}

		// Handle URL verification challenge
		if (isUrlVerification(event)) {
			console.log('[Agent] URL verification challenge received');
			return new Response(event.challenge, {
				headers: { 'Content-Type': 'text/plain' },
			});
		}

		// Handle message events
		if (isEventCallback(event)) {
			console.log('[Agent] Event callback received, processing asynchronously...');
			// Respond immediately to avoid Slack retries
			const response = new Response('OK', { status: 200 });

			// Process asynchronously
			this.ctx.waitUntil(this.handleSlackEvent(event));

			return response;
		}

		console.log('[Agent] Unknown event type:', (event as { type: string }).type);
		return new Response('Unknown event type', { status: 400 });
	}

	// Handle Slack interaction (button click)
	private async handleSlackInteraction(body: string): Promise<void> {
		let interaction: SlackInteractionPayload;
		try {
			interaction = parseInteractionPayload(body);
			console.log('[Agent] Parsed interaction:', JSON.stringify(interaction, null, 2));
		} catch (e) {
			console.error('[Agent] Failed to parse interaction payload:', e);
			return;
		}

		// Only handle block_actions (button clicks)
		if (interaction.type !== 'block_actions') {
			console.log('[Agent] Ignoring non-block_actions interaction:', interaction.type);
			return;
		}

		// Process each action (usually just one)
		for (const action of interaction.actions) {
			console.log('[Agent] Processing action:', action.action_id);

			// Decode the button payload
			let payload: ButtonPayload;
			try {
				payload = decodeButtonPayload(action.value);
				console.log('[Agent] Decoded button payload:', JSON.stringify(payload));
			} catch (e) {
				console.error('[Agent] Failed to decode button payload:', e);
				await respondToInteraction(interaction.response_url, 'Error: Invalid button payload', true);
				continue;
			}

			const context = this.state.threadContexts[payload.threadTs];
			if (!context) {
				console.log('[Agent] No context found for thread:', payload.threadTs);
				await respondToInteraction(
					interaction.response_url,
					"Sorry, I've lost context for this thread. Please try again with a new message.",
					true
				);
				continue;
			}

			// Handle based on action type
			switch (payload.action) {
				case 'category_select':
					await this.handleCategorySelectionButton(payload, context, interaction);
					break;
				case 'duplicate_resolve':
					await this.handleDuplicateResolutionButton(payload, context, interaction);
					break;
				case 'thread_option':
					await this.handleThreadOptionButton(payload, context, interaction);
					break;
				default:
					console.error('[Agent] Unknown action type:', payload.action);
			}
		}
	}

	// Handle category selection button click
	private async handleCategorySelectionButton(
		payload: ButtonPayload,
		context: AgentState['threadContexts'][string],
		interaction: SlackInteractionPayload
	): Promise<void> {
		const newCategory = payload.data.category!;
		console.log('[Agent] Category selected via button:', newCategory);

		// Update classification with user-confirmed category
		const updatedClassification: ClassificationResult = {
			...context.classification,
			category: newCategory,
			confidence: 0.95, // User-confirmed
		};

		// File to Notion
		const pageId = await this.fileToNotion(updatedClassification);
		console.log('[Agent] Filed to Notion, page ID:', pageId);

		// Update thread context
		await this.updateState({
			...this.state,
			threadContexts: {
				...this.state.threadContexts,
				[payload.threadTs]: {
					...context,
					classification: updatedClassification,
					notionPageId: pageId,
				},
			},
		});

		// Respond - replace original message with confirmation
		const confirmation = formatConfirmation(newCategory, updatedClassification.name, 0.95);
		await respondToInteraction(interaction.response_url, confirmation, true);
	}

	// Handle duplicate resolution button click
	private async handleDuplicateResolutionButton(
		payload: ButtonPayload,
		context: AgentState['threadContexts'][string],
		interaction: SlackInteractionPayload
	): Promise<void> {
		const resolution = payload.data.resolution!;
		console.log('[Agent] Duplicate resolution via button:', resolution);

		if (resolution === 'update') {
			const duplicate = context.potentialDuplicate!;
			const properties = this.buildUpdateProperties(context.classification);
			await updatePage(duplicate.pageId, properties, this.env.NOTION_TOKEN);

			const response = `Updated existing ${duplicate.category}: "${duplicate.name}"`;
			await respondToInteraction(interaction.response_url, response, true);

			await this.updateState({
				...this.state,
				threadContexts: {
					...this.state.threadContexts,
					[payload.threadTs]: {
						...context,
						notionPageId: duplicate.pageId,
						potentialDuplicate: undefined,
					},
				},
			});
		} else {
			// Create new
			const pageId = await this.fileToNotion(context.classification);
			const response = formatConfirmation(
				context.classification.category,
				context.classification.name,
				context.classification.confidence
			);
			await respondToInteraction(interaction.response_url, response, true);

			await this.updateState({
				...this.state,
				threadContexts: {
					...this.state.threadContexts,
					[payload.threadTs]: {
						...context,
						notionPageId: pageId,
						potentialDuplicate: undefined,
					},
				},
			});
		}
	}

	// Handle thread option button click (guidance buttons)
	private async handleThreadOptionButton(
		payload: ButtonPayload,
		context: AgentState['threadContexts'][string],
		interaction: SlackInteractionPayload
	): Promise<void> {
		const option = payload.data.option!;
		console.log('[Agent] Thread option selected via button:', option);

		let guidance: string;
		switch (option) {
			case 'change_category':
				guidance = `Current category: ${context.classification.category}\nWhich category should this be? Reply with: person, project, idea, or admin`;
				break;
			case 'edit_fields':
				guidance = `What would you like to update? Examples:\n• "change the name to X"\n• "set status to active"\n• "add due date: 2024-01-15"`;
				break;
			case 'add_context':
				guidance = `What additional context would you like to add? Just type it and I'll append it to the entry.`;
				break;
			default:
				guidance = "I didn't understand that option.";
		}

		await respondToInteraction(interaction.response_url, guidance, true);
	}

	private async handleSlackEvent(event: SlackEventCallback): Promise<void> {
		const message = event.event;
		console.log('[Agent] handleSlackEvent called with:', JSON.stringify(message, null, 2));

		// Ignore bot messages
		if (message.bot_id) {
			console.log('[Agent] Ignoring bot message');
			return;
		}

		// Handle voice messages (file_share with audio files)
		if (message.subtype === 'file_share' && message.files?.length) {
			const audioFile = message.files.find(isAudioFile);
			if (audioFile) {
				console.log('[Agent] Processing voice message:', audioFile.id);
				await this.handleVoiceMessage(event, audioFile);
				return;
			}
		}

		// Ignore other subtypes (edits, deletes, etc.) and messages without text
		if (message.subtype || !message.text) {
			console.log('[Agent] Ignoring message - subtype:', message.subtype);
			return;
		}

		// Check if this is a thread reply (correction/clarification)
		if (message.thread_ts && message.thread_ts !== message.ts) {
			await this.handleThreadReply(event);
			return;
		}

		// Detect message intent (capture vs query)
		try {
			console.log('[Agent] Detecting message intent...');
			const intent = await detectMessageIntent(message.text, this.env.OPENROUTER_API_KEY);
			console.log('[Agent] Message intent:', JSON.stringify(intent));

			if (intent.intent === 'query' && intent.confidence >= 0.6) {
				// Add search reaction to show we're querying
				try {
					await addReaction(message.channel, message.ts, 'mag', this.env.SLACK_BOT_TOKEN);
				} catch (e) {
					console.error('[Agent] Failed to add search reaction:', e);
				}

				// Handle as query
				await this.handleQuery(message.text, message.channel, message.ts);
				return;
			}
		} catch (error) {
			console.error('[Agent] Error detecting intent, defaulting to capture:', error);
			// Fall through to capture mode
		}

		// Process as capture (new message)
		await this.processNewMessage(event);
	}

	// Handle voice messages by transcribing and processing as text
	private async handleVoiceMessage(event: SlackEventCallback, audioFile: SlackFile): Promise<void> {
		const message = event.event;

		// Add microphone reaction to show we're processing
		try {
			await addReaction(message.channel, message.ts, 'studio_microphone', this.env.SLACK_BOT_TOKEN);
		} catch (e) {
			console.error('[Agent] Failed to add microphone reaction:', e);
		}

		try {
			// Download the audio file from Slack
			console.log('[Agent] Downloading audio file...');
			const audioData = await downloadSlackFile(audioFile.url_private_download || audioFile.url_private, this.env.SLACK_BOT_TOKEN);
			console.log('[Agent] Audio file downloaded, size:', audioData.byteLength);

			// Transcribe using Whisper
			console.log('[Agent] Transcribing audio...');
			const transcription = await transcribeAudio(audioData, this.env.AI);
			console.log('[Agent] Transcription result:', transcription.text);

			if (!transcription.text || transcription.text.trim() === '') {
				await postMessage(
					message.channel,
					"I couldn't understand the voice message. Could you try again or type your thought?",
					this.env.SLACK_BOT_TOKEN,
					message.ts
				);
				return;
			}

			// Add speech balloon reaction to show transcription complete
			try {
				await addReaction(message.channel, message.ts, 'speech_balloon', this.env.SLACK_BOT_TOKEN);
			} catch (e) {
				console.error('[Agent] Failed to add speech balloon reaction:', e);
			}

			// Create a modified event with transcribed text for processing
			const transcribedEvent: SlackEventCallback = {
				...event,
				event: {
					...message,
					text: transcription.text,
					subtype: undefined, // Clear subtype so it processes normally
				},
			};

			// Process as a regular message (classify and file)
			await this.processNewMessage(transcribedEvent);
		} catch (error) {
			console.error('[Agent] Error processing voice message:', error);

			// Add warning reaction
			try {
				await addReaction(message.channel, message.ts, 'warning', this.env.SLACK_BOT_TOKEN);
			} catch (e) {
				console.error('[Agent] Failed to add warning reaction:', e);
			}

			// Notify user of error
			await postMessage(
				message.channel,
				`Error processing voice message: ${error instanceof Error ? error.message : 'Unknown error'}. Try posting as text instead.`,
				this.env.SLACK_BOT_TOKEN,
				message.ts
			);
		}
	}

	private async processNewMessage(event: SlackEventCallback): Promise<void> {
		const message = event.event;
		const text = message.text;

		console.log('[Agent] processNewMessage started for:', text);

		// Add checkmark reaction immediately to show we've received the message
		try {
			await addReaction(message.channel, message.ts, 'white_check_mark', this.env.SLACK_BOT_TOKEN);
		} catch (e) {
			console.error('[Agent] Failed to add checkmark reaction:', e);
			// Continue processing even if reaction fails
		}

		try {
			// Classify the message
			console.log('[Agent] Calling OpenRouter for classification...');
			const classification = await classify(text, this.env.OPENROUTER_API_KEY);
			console.log('[Agent] Classification result:', JSON.stringify(classification, null, 2));

			// Log to inbox
			console.log('[Agent] Creating inbox log in Notion...');
			await createInboxLog(
				{
					record_name: classification.name,
					captured_text: text,
					confidence: classification.confidence,
					created: new Date().toISOString(),
					destination: classification.confidence >= CONFIDENCE_THRESHOLD ? classification.category : 'needs_review',
				},
				this.env.NOTION_TOKEN,
				this.env.NOTION_DB_INBOX_LOG
			);
			console.log('[Agent] Inbox log created');

			// Check confidence threshold
			console.log('[Agent] Confidence:', classification.confidence, 'Threshold:', CONFIDENCE_THRESHOLD);
			if (classification.confidence < CONFIDENCE_THRESHOLD) {
				// Low confidence - ask for clarification
				console.log('[Agent] Low confidence - asking for clarification with buttons');
				const { blocks, text } = buildCategorySelectionBlocks(classification.confidence, message.ts, message.channel);
				await postMessageWithBlocks(message.channel, blocks, text, this.env.SLACK_BOT_TOKEN, message.ts);
				console.log('[Agent] Clarification request with buttons sent');

				// Store context for follow-up
				await this.updateState({
					...this.state,
					threadContexts: {
						...this.state.threadContexts,
						[message.ts]: {
							originalMessage: text,
							classification,
							messages: [],
							createdAt: new Date().toISOString(),
						},
					},
				});

				return;
			}

			// High confidence - check for duplicates first
			console.log('[Agent] High confidence - checking for duplicates...');
			const duplicates = await searchForDuplicates(classification.name, classification.category, this.env);

			if (duplicates.length > 0 && duplicates[0].score > 0.8) {
				// Strong potential duplicate - ask user
				const duplicate = duplicates[0];
				console.log('[Agent] Found potential duplicate:', duplicate.name);

				const { blocks, text } = buildDuplicateResolutionBlocks(
					classification.category,
					duplicate.name,
					message.ts,
					message.channel
				);
				await postMessageWithBlocks(message.channel, blocks, text, this.env.SLACK_BOT_TOKEN, message.ts);

				// Store context with duplicate info for follow-up
				await this.updateState({
					...this.state,
					threadContexts: {
						...this.state.threadContexts,
						[message.ts]: {
							originalMessage: text,
							classification,
							potentialDuplicate: {
								pageId: duplicate.page.id,
								name: duplicate.name,
								category: duplicate.category,
								score: duplicate.score,
							},
							messages: [],
							createdAt: new Date().toISOString(),
						},
					},
				});
				return;
			}

			// No duplicates or weak match - file to Notion
			console.log('[Agent] Filing to Notion...');
			const pageId = await this.fileToNotion(classification);
			console.log('[Agent] Filed to Notion, page ID:', pageId);

			// Add 💯 reaction if confidence is exactly 1.0
			if (classification.confidence === 1.0) {
				try {
					await addReaction(message.channel, message.ts, '100', this.env.SLACK_BOT_TOKEN);
				} catch (e) {
					console.error('[Agent] Failed to add 100 reaction:', e);
				}
			}

			// Build confirmation message
			let confirmationMsg = formatConfirmation(classification.category, classification.name, classification.confidence);
			if (duplicates.length > 0) {
				// Mention weak matches
				confirmationMsg += `\n(Note: Similar entries exist: ${duplicates.map((d) => d.name).join(', ')})`;
			}

			// Reply with confirmation
			console.log('[Agent] Posting confirmation to Slack...');
			await postMessage(message.channel, confirmationMsg, this.env.SLACK_BOT_TOKEN, message.ts);
			console.log('[Agent] Confirmation posted');

			// Store context for potential corrections
			await this.updateState({
				...this.state,
				threadContexts: {
					...this.state.threadContexts,
					[message.ts]: {
						originalMessage: text,
						classification,
						notionPageId: pageId,
						messages: [],
						createdAt: new Date().toISOString(),
					},
				},
			});
		} catch (error) {
			console.error('[Agent] Error processing message:', error);
			console.error('[Agent] Error stack:', error instanceof Error ? error.stack : 'No stack');

			// Notify user of error
			try {
				await postMessage(
					message.channel,
					`Error processing message: ${error instanceof Error ? error.message : 'Unknown error'}`,
					this.env.SLACK_BOT_TOKEN,
					message.ts
				);
				console.log('[Agent] Error notification sent to Slack');
			} catch (slackError) {
				console.error('[Agent] Failed to send error to Slack:', slackError);
			}
		}
	}

	private async handleThreadReply(event: SlackEventCallback): Promise<void> {
		const message = event.event;
		const threadTs = message.thread_ts!;
		const replyText = message.text;

		// Get thread context
		const context = this.state.threadContexts[threadTs];
		if (!context) {
			await postMessage(
				message.channel,
				"I don't have context for this thread. Try posting a new message.",
				this.env.SLACK_BOT_TOKEN,
				threadTs
			);
			return;
		}

		// Add user message to conversation history
		const updatedMessages: ThreadMessage[] = [...(context.messages || []), { role: 'user', content: replyText, ts: message.ts }];

		// Handle duplicate resolution with simple keyword check first (quick path)
		if (context.potentialDuplicate) {
			const lowerText = replyText.toLowerCase().trim();
			if (lowerText === 'update' || lowerText.includes('update')) {
				await this.handleDuplicateUpdate(context, threadTs, message.channel, updatedMessages);
				return;
			} else if (lowerText === 'new' || lowerText.includes('new')) {
				await this.handleDuplicateNew(context, threadTs, message.channel, updatedMessages);
				return;
			}
		}

		// Use AI to determine intent
		console.log('[Agent] Detecting thread intent with AI...');
		try {
			const intent = await detectThreadIntent(
				context.originalMessage,
				context.classification,
				context.messages || [],
				replyText,
				this.env.OPENROUTER_API_KEY
			);
			console.log('[Agent] Thread intent detected:', JSON.stringify(intent));

			// Add bot response to history after we respond
			let botResponse = '';

			switch (intent.intent) {
				case 'correct_category': {
					const newCategory = intent.details.newCategory as Category;
					if (newCategory && newCategory !== context.classification.category) {
						const updatedClassification: ClassificationResult = {
							...context.classification,
							category: newCategory,
							confidence: 0.95,
						};
						const pageId = await this.fileToNotion(updatedClassification);
						botResponse = `Got it. Moved to ${newCategory.charAt(0).toUpperCase() + newCategory.slice(1)}: ${updatedClassification.name}`;

						await this.updateState({
							...this.state,
							threadContexts: {
								...this.state.threadContexts,
								[threadTs]: {
									...context,
									classification: updatedClassification,
									notionPageId: pageId,
									messages: [...updatedMessages, { role: 'assistant', content: botResponse, ts: Date.now().toString() }],
								},
							},
						});
					} else {
						botResponse = `Already categorized as ${context.classification.category}.`;
					}
					break;
				}

				case 'update_field': {
					if (context.notionPageId && intent.details.field && intent.details.value) {
						const properties = this.buildFieldUpdateProperties(
							intent.details.field,
							intent.details.value,
							context.classification.category
						);
						await updatePage(context.notionPageId, properties, this.env.NOTION_TOKEN);
						botResponse = `Updated ${intent.details.field} to "${intent.details.value}"`;

						await this.updateState({
							...this.state,
							threadContexts: {
								...this.state.threadContexts,
								[threadTs]: {
									...context,
									messages: [...updatedMessages, { role: 'assistant', content: botResponse, ts: Date.now().toString() }],
								},
							},
						});
					} else {
						botResponse = "I couldn't update the field. The entry may not have been filed yet.";
					}
					break;
				}

				case 'add_context': {
					if (context.notionPageId && intent.details.context) {
						// Append to context or notes field depending on category
						const fieldName = context.classification.category === 'person' ? 'Context' : 'Notes';
						const properties = {
							[fieldName]: { rich_text: [{ text: { content: intent.details.context } }] },
						};
						await updatePage(context.notionPageId, properties, this.env.NOTION_TOKEN);
						botResponse = `Added context: "${intent.details.context}"`;

						await this.updateState({
							...this.state,
							threadContexts: {
								...this.state.threadContexts,
								[threadTs]: {
									...context,
									messages: [...updatedMessages, { role: 'assistant', content: botResponse, ts: Date.now().toString() }],
								},
							},
						});
					} else {
						botResponse = "I couldn't add context. The entry may not have been filed yet.";
					}
					break;
				}

				case 'create_related': {
					if (intent.details.category && intent.details.name) {
						const relatedClassification: ClassificationResult = {
							category: intent.details.category,
							name: intent.details.name,
							confidence: 0.9,
							fields: intent.details.fields || { name: intent.details.name },
						};
						const pageId = await this.fileToNotion(relatedClassification);
						botResponse = `Created related ${intent.details.category}: "${intent.details.name}"`;

						await this.updateState({
							...this.state,
							threadContexts: {
								...this.state.threadContexts,
								[threadTs]: {
									...context,
									messages: [...updatedMessages, { role: 'assistant', content: botResponse, ts: Date.now().toString() }],
								},
							},
						});
					} else {
						botResponse = "I couldn't create a related entry. Please provide more details.";
					}
					break;
				}

				case 'query': {
					// Handle as a query
					await this.handleQuery(intent.details.question || replyText, message.channel, threadTs);
					// Update messages without adding bot response (handleQuery does that)
					await this.updateState({
						...this.state,
						threadContexts: {
							...this.state.threadContexts,
							[threadTs]: { ...context, messages: updatedMessages },
						},
					});
					return; // handleQuery posts the response
				}

				case 'unclear':
				default: {
					// Send Block Kit message with buttons
					const { blocks, text } = buildThreadOptionsBlocks(threadTs, message.channel, !!context.potentialDuplicate);
					await postMessageWithBlocks(message.channel, blocks, text, this.env.SLACK_BOT_TOKEN, threadTs);
					botResponse = text; // Use fallback text for conversation history

					await this.updateState({
						...this.state,
						threadContexts: {
							...this.state.threadContexts,
							[threadTs]: {
								...context,
								messages: [...updatedMessages, { role: 'assistant', content: botResponse, ts: Date.now().toString() }],
							},
						},
					});
					return; // Already posted the message with buttons
				}
			}

			if (botResponse) {
				await postMessage(message.channel, botResponse, this.env.SLACK_BOT_TOKEN, threadTs);
			}
		} catch (error) {
			console.error('[Agent] Error detecting thread intent:', error);
			await postMessage(
				message.channel,
				"I had trouble understanding that. Could you try rephrasing?",
				this.env.SLACK_BOT_TOKEN,
				threadTs
			);
		}
	}

	// Handle duplicate resolution: update existing
	private async handleDuplicateUpdate(
		context: AgentState['threadContexts'][string],
		threadTs: string,
		channel: string,
		messages: ThreadMessage[]
	): Promise<void> {
		const duplicate = context.potentialDuplicate!;
		const properties = this.buildUpdateProperties(context.classification);
		await updatePage(duplicate.pageId, properties, this.env.NOTION_TOKEN);

		const botResponse = `Updated existing ${duplicate.category}: "${duplicate.name}"`;
		await postMessage(channel, botResponse, this.env.SLACK_BOT_TOKEN, threadTs);

		await this.updateState({
			...this.state,
			threadContexts: {
				...this.state.threadContexts,
				[threadTs]: {
					...context,
					notionPageId: duplicate.pageId,
					potentialDuplicate: undefined,
					messages: [...messages, { role: 'assistant', content: botResponse, ts: Date.now().toString() }],
				},
			},
		});
	}

	// Handle duplicate resolution: create new
	private async handleDuplicateNew(
		context: AgentState['threadContexts'][string],
		threadTs: string,
		channel: string,
		messages: ThreadMessage[]
	): Promise<void> {
		const pageId = await this.fileToNotion(context.classification);
		const botResponse = formatConfirmation(context.classification.category, context.classification.name, context.classification.confidence);
		await postMessage(channel, botResponse, this.env.SLACK_BOT_TOKEN, threadTs);

		await this.updateState({
			...this.state,
			threadContexts: {
				...this.state.threadContexts,
				[threadTs]: {
					...context,
					notionPageId: pageId,
					potentialDuplicate: undefined,
					messages: [...messages, { role: 'assistant', content: botResponse, ts: Date.now().toString() }],
				},
			},
		});
	}

	// Build properties for updating a single field
	private buildFieldUpdateProperties(field: string, value: string, category: Category): Record<string, unknown> {
		const fieldMapping: Record<string, Record<string, string>> = {
			person: { name: 'Name', context: 'Context', follow_ups: 'Follow-ups', nicknames: 'Nicknames' },
			project: { name: 'Name', next_action: 'Next Action', notes: 'Notes', status: 'Status' },
			idea: { name: 'Name', one_liner: 'One-liner', notes: 'Notes' },
			admin: { name: 'Name', due_date: 'Due Date', status: 'Status' },
		};

		const notionField = fieldMapping[category]?.[field] || field;

		if (notionField === 'Name') {
			return { [notionField]: { title: [{ text: { content: value } }] } };
		} else if (notionField === 'Status') {
			return { [notionField]: { select: { name: value } } };
		} else if (notionField === 'Due Date') {
			return { [notionField]: { date: { start: value } } };
		} else {
			return { [notionField]: { rich_text: [{ text: { content: value } }] } };
		}
	}

	// Handle a query about the database
	private async handleQuery(question: string, channel: string, threadTs?: string): Promise<void> {
		try {
			// Search across all databases
			const { searchAll } = await import('./services/search');
			const results = await searchAll(question, this.env);

			// Format search results for the AI
			const searchResultsText =
				results.length > 0
					? results
							.slice(0, 10)
							.map((r) => `- ${r.category}: "${r.name}" (match: ${Math.round(r.score * 100)}%)`)
							.join('\n')
					: 'No matching entries found.';

			// Generate response with AI
			const response = await generateQueryResponse(question, searchResultsText, this.env.OPENROUTER_API_KEY);

			await postMessage(channel, response, this.env.SLACK_BOT_TOKEN, threadTs);
		} catch (error) {
			console.error('[Agent] Error handling query:', error);
			await postMessage(
				channel,
				"I had trouble searching your data. Please try again.",
				this.env.SLACK_BOT_TOKEN,
				threadTs
			);
		}
	}

	// Build Notion properties for updating an existing page
	private buildUpdateProperties(classification: ClassificationResult): Record<string, unknown> {
		const { category, name, fields } = classification;
		const properties: Record<string, unknown> = {
			Name: { title: [{ text: { content: name } }] },
		};

		switch (category) {
			case 'person': {
				const personFields = fields as { nicknames?: string[]; context?: string; follow_ups?: string };
				if (personFields.context) {
					properties['Context'] = { rich_text: [{ text: { content: personFields.context } }] };
				}
				if (personFields.follow_ups) {
					properties['Follow-ups'] = { rich_text: [{ text: { content: personFields.follow_ups } }] };
				}
				if (personFields.nicknames && personFields.nicknames.length > 0) {
					properties['Nicknames'] = { rich_text: [{ text: { content: personFields.nicknames.join(', ') } }] };
				}
				properties['Last Touched'] = { date: { start: new Date().toISOString().split('T')[0] } };
				break;
			}
			case 'project': {
				const projectFields = fields as { next_action?: string; notes?: string; status?: string };
				if (projectFields.next_action) {
					properties['Next Action'] = { rich_text: [{ text: { content: projectFields.next_action } }] };
				}
				if (projectFields.notes) {
					properties['Notes'] = { rich_text: [{ text: { content: projectFields.notes } }] };
				}
				break;
			}
			case 'idea': {
				const ideaFields = fields as { one_liner?: string; notes?: string };
				if (ideaFields.one_liner) {
					properties['One-liner'] = { rich_text: [{ text: { content: ideaFields.one_liner } }] };
				}
				if (ideaFields.notes) {
					properties['Notes'] = { rich_text: [{ text: { content: ideaFields.notes } }] };
				}
				break;
			}
			case 'admin': {
				const adminFields = fields as { due_date?: string | null };
				if (adminFields.due_date) {
					properties['Due Date'] = { date: { start: adminFields.due_date } };
				}
				break;
			}
		}

		return properties;
	}

	private async fileToNotion(classification: ClassificationResult): Promise<string> {
		const { category, name, fields } = classification;
		const token = this.env.NOTION_TOKEN;
		const dbId = getDatabaseId(category, this.env);

		let page;

		switch (category) {
			case 'person':
				page = await createPerson(
					{
						name,
						nicknames: (fields as { nicknames?: string[] }).nicknames,
						context: (fields as { context?: string }).context,
						follow_ups: (fields as { follow_ups?: string }).follow_ups,
						last_touched: new Date().toISOString().split('T')[0],
					},
					token,
					dbId
				);
				break;

			case 'project':
				page = await createProject(
					{
						name,
						next_action: (fields as { next_action?: string }).next_action,
						notes: (fields as { notes?: string }).notes,
						status: (fields as { status?: 'active' | 'waiting' | 'blocked' | 'someday' | 'done' }).status || 'active',
					},
					token,
					dbId
				);
				break;

			case 'idea':
				page = await createIdea(
					{
						name,
						one_liner: (fields as { one_liner?: string }).one_liner,
						notes: (fields as { notes?: string }).notes,
					},
					token,
					dbId
				);
				break;

			case 'admin':
				page = await createAdmin(
					{
						name,
						due_date: (fields as { due_date?: string | null }).due_date,
						status: (fields as { status?: 'pending' | 'done' }).status || 'pending',
					},
					token,
					dbId
				);
				break;
		}

		return page.id;
	}

	// Daily digest at 6am
	private async dailyDigest(): Promise<void> {
		try {
			// Query active projects
			const projects = await queryDatabase(this.env.NOTION_DB_PROJECTS, this.env.NOTION_TOKEN, {
				property: 'Status',
				select: { equals: 'active' },
			});

			// Query people not touched in 30+ days
			const thirtyDaysAgo = new Date();
			thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

			const stalePeople = await queryDatabase(this.env.NOTION_DB_PEOPLE, this.env.NOTION_TOKEN, {
				property: 'Last Touched',
				date: { before: thirtyDaysAgo.toISOString() },
			});

			// For now, send a simple digest
			// TODO: Generate with AI using DAILY_DIGEST_PROMPT
			const digestText = `Good morning! Here's your daily digest:

Active Projects: ${projects.length}
People to reconnect with: ${stalePeople.length}

Have a productive day!`;

			await sendDM(this.env.SLACK_USER_ID, digestText, this.env.SLACK_BOT_TOKEN);
		} catch (error) {
			console.error('Error generating daily digest:', error);
		}
	}

	// Weekly review Sunday at 4pm
	private async weeklyReview(): Promise<void> {
		try {
			// Query this week's inbox entries
			const oneWeekAgo = new Date();
			oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

			const weeklyEntries = await queryDatabase(this.env.NOTION_DB_INBOX_LOG, this.env.NOTION_TOKEN, {
				property: 'Created',
				date: { after: oneWeekAgo.toISOString() },
			});

			// Query active projects
			const projects = await queryDatabase(this.env.NOTION_DB_PROJECTS, this.env.NOTION_TOKEN, {
				property: 'Status',
				select: { equals: 'active' },
			});

			// For now, send a simple review
			// TODO: Generate with AI using WEEKLY_REVIEW_PROMPT
			const reviewText = `Weekly Review:

This week you captured: ${weeklyEntries.length} thoughts
Active projects: ${projects.length}

Take some time to review and prioritize for next week.`;

			await sendDM(this.env.SLACK_USER_ID, reviewText, this.env.SLACK_BOT_TOKEN);
		} catch (error) {
			console.error('Error generating weekly review:', error);
		}
	}
}
