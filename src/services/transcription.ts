import type { SlackFile } from '../types';

export interface TranscriptionResult {
	text: string;
	wordCount: number;
}

// Download audio file from Slack
export async function downloadSlackFile(fileUrl: string, botToken: string): Promise<ArrayBuffer> {
	const response = await fetch(fileUrl, {
		headers: {
			Authorization: `Bearer ${botToken}`,
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
	}

	return response.arrayBuffer();
}

// Convert ArrayBuffer to base64 string
function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

// Transcribe audio using Cloudflare Workers AI (Whisper)
export async function transcribeAudio(audioData: ArrayBuffer, ai: Ai): Promise<TranscriptionResult> {
	// Convert ArrayBuffer to base64 for Whisper model
	const base64Audio = arrayBufferToBase64(audioData);

	const response = (await ai.run('@cf/openai/whisper-large-v3-turbo', {
		audio: base64Audio,
	})) as { text: string; word_count?: number };

	return {
		text: response.text || '',
		wordCount: response.word_count || 0,
	};
}

// Check if a Slack file is an audio file
export function isAudioFile(file: SlackFile): boolean {
	const audioMimetypes = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-m4a', 'audio/mp3'];
	const audioFiletypes = ['webm', 'mp3', 'mp4', 'm4a', 'ogg', 'wav'];

	return audioMimetypes.includes(file.mimetype) || audioFiletypes.includes(file.filetype) || file.subtype === 'slack_audio';
}
