import { ProtoBusClient, Callbacks } from "./grpc-client-base"

interface TTSToggleResponse {
	enabled: boolean
}

interface TTSState {
	enabled: boolean
	isPlaying: boolean
	queueLength: number
}

interface SpeakTextRequest {
	text: string
}

interface TTSSettingsRequest {
	enabled?: boolean
	language_code?: string
	voice_name?: string
	ssml_gender?: string
	audio_encoding?: string
	speaking_rate?: number
	pitch?: number
	// Google Cloud credentials
	client_email?: string
	private_key?: string
	project_id?: string
}

export class VoiceClient extends ProtoBusClient {
	static serviceName = "cline.VoiceService"

	// Toggle TTS on/off
	static toggleTTS(): Promise<TTSToggleResponse> {
		return this.makeRequest<{}, TTSToggleResponse>("toggleTTS", {})
	}

	// Get TTS settings
	static getTTSSettings(): Promise<any> {
		return this.makeRequest<{}, any>("getTTSSettings", {})
	}

	// Update TTS settings
	static updateTTSSettings(settings: TTSSettingsRequest): Promise<void> {
		return this.makeRequest<TTSSettingsRequest, void>("updateTTSSettings", settings)
	}

	// Speak text
	static speakText(text: string): Promise<void> {
		return this.makeRequest<SpeakTextRequest, void>("speakText", { text })
	}

	// Subscribe to TTS state changes
	static subscribeToTTSState(callbacks: Callbacks<TTSState>): () => void {
		return this.makeStreamingRequest<{}, TTSState>("subscribeToTTSState", {}, callbacks)
	}
}
