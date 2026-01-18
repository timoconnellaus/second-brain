// Slack Event Types
export type SlackEventType = 'url_verification' | 'event_callback';

export interface SlackUrlVerification {
	type: 'url_verification';
	challenge: string;
	token: string;
}

export interface SlackEventCallback {
	type: 'event_callback';
	token: string;
	team_id: string;
	event: SlackMessageEvent;
	event_id: string;
	event_time: number;
}

export interface SlackMessageEvent {
	type: 'message';
	subtype?: string;
	channel: string;
	user: string;
	text: string;
	ts: string;
	thread_ts?: string;
	event_ts: string;
	bot_id?: string;
}

export type SlackEvent = SlackUrlVerification | SlackEventCallback;

// Classification Types
export type Category = 'person' | 'project' | 'idea' | 'admin';

export interface PersonFields {
	name: string;
	nicknames?: string[];
	context?: string;
	follow_ups?: string;
}

export interface ProjectFields {
	name: string;
	next_action?: string;
	notes?: string;
	status?: 'active' | 'waiting' | 'blocked' | 'someday' | 'done';
}

export interface IdeaFields {
	name: string;
	one_liner?: string;
	notes?: string;
}

export interface AdminFields {
	name: string;
	due_date?: string | null;
	status?: 'pending' | 'done';
}

export type CategoryFields = PersonFields | ProjectFields | IdeaFields | AdminFields;

export interface ClassificationResult {
	category: Category;
	confidence: number;
	name: string;
	fields: CategoryFields;
}

// Notion Entry Types
export interface NotionPerson {
	name: string;
	nicknames?: string[];
	context?: string;
	follow_ups?: string;
	last_touched: string;
	tags?: string[];
}

export interface NotionProject {
	name: string;
	next_action?: string;
	notes?: string;
	status: 'active' | 'waiting' | 'blocked' | 'someday' | 'done';
}

export interface NotionIdea {
	name: string;
	one_liner?: string;
	notes?: string;
	tags?: string[];
}

export interface NotionAdmin {
	name: string;
	due_date?: string | null;
	status: 'pending' | 'done';
}

export interface NotionInboxLog {
	record_name: string;
	captured_text: string;
	confidence: number;
	created: string;
	destination: Category | 'needs_review';
}

// Search result for duplicate detection
export interface PotentialDuplicate {
	pageId: string;
	name: string;
	category: Category;
	score: number;
}

// Thread message for conversation history
export interface ThreadMessage {
	role: 'user' | 'assistant';
	content: string;
	ts: string;
}

// Thread intent types
export type ThreadIntentType = 'correct_category' | 'update_field' | 'add_context' | 'create_related' | 'query' | 'unclear';

export interface ThreadIntent {
	intent: ThreadIntentType;
	details: {
		newCategory?: Category;
		field?: string;
		value?: string;
		context?: string;
		category?: Category;
		name?: string;
		fields?: CategoryFields;
		question?: string;
	};
	confidence: number;
}

// Message intent (capture vs query)
export interface MessageIntent {
	intent: 'capture' | 'query';
	confidence: number;
}

// Agent State
export interface AgentState {
	// Thread context for corrections/clarifications
	threadContexts: Record<
		string,
		{
			originalMessage: string;
			classification: ClassificationResult;
			notionPageId?: string;
			potentialDuplicate?: PotentialDuplicate;
			messages: ThreadMessage[];
			createdAt: string;
		}
	>;
}

// Slack Interaction Types (for button clicks)
export interface SlackInteractionPayload {
	type: 'block_actions' | 'view_submission' | 'view_closed';
	user: { id: string; username: string };
	channel?: { id: string };
	message?: {
		ts: string;
		thread_ts?: string;
	};
	response_url: string;
	actions: SlackAction[];
	trigger_id: string;
}

export interface SlackAction {
	action_id: string;
	block_id: string;
	value: string;
	type: 'button';
	action_ts: string;
}

// Button payload encoding for passing context through button values
export type ButtonAction = 'category_select' | 'duplicate_resolve' | 'thread_option';

export interface ButtonPayload {
	action: ButtonAction;
	threadTs: string;
	channel: string;
	data: {
		category?: Category;
		resolution?: 'update' | 'new';
		option?: 'change_category' | 'edit_fields' | 'add_context';
	};
}

// Block Kit types
export interface SlackBlock {
	type: 'section' | 'actions' | 'divider' | 'context';
	text?: { type: 'mrkdwn' | 'plain_text'; text: string };
	block_id?: string;
	elements?: SlackBlockElement[];
}

export interface SlackBlockElement {
	type: 'button';
	text: { type: 'plain_text'; text: string; emoji?: boolean };
	action_id: string;
	value: string;
	style?: 'primary' | 'danger';
}
