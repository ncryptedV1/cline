import { Controller } from "../index"
import { Empty } from "@shared/proto/common"
import { TTSSettings } from "../../../services/voice/VoiceService"

/**
 * TTS settings request
 */
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

/**
 * Update TTS settings
 * @param controller The controller instance
 * @param request TTSSettingsRequest containing the new settings
 * @returns Empty response
 */
export async function updateTTSSettings(controller: Controller, request: TTSSettingsRequest): Promise<Empty> {
	try {
		// Convert gRPC request to VoiceService format
		// Get current settings to merge with new ones
		const currentSettings = controller.voiceService.getTTSSettings()
		const settings: Partial<TTSSettings> = {}

		if (request.enabled !== undefined) {
			settings.enabled = request.enabled
		}

		if (request.language_code || request.voice_name || request.ssml_gender) {
			settings.voice = {
				...currentSettings.voice,
				...(request.language_code && { languageCode: request.language_code }),
				...(request.voice_name && { name: request.voice_name }),
				...(request.ssml_gender && { ssmlGender: request.ssml_gender as "NEUTRAL" | "FEMALE" | "MALE" }),
			}
		}

		if (request.audio_encoding || request.speaking_rate !== undefined || request.pitch !== undefined) {
			settings.audioConfig = {
				...currentSettings.audioConfig,
				...(request.audio_encoding && { audioEncoding: request.audio_encoding as "MP3" | "LINEAR16" | "OGG_OPUS" }),
				...(request.speaking_rate !== undefined && { speakingRate: request.speaking_rate }),
				...(request.pitch !== undefined && { pitch: request.pitch }),
			}
		}

		// Handle Google Cloud credentials
		if (request.client_email || request.private_key || request.project_id) {
			settings.credentials = {
				client_email: request.client_email || currentSettings.credentials?.client_email || "",
				private_key: request.private_key || currentSettings.credentials?.private_key || "",
				project_id: request.project_id || currentSettings.credentials?.project_id || "",
			}
		}

		await controller.voiceService.updateTTSSettings(settings)
		return Empty.create()
	} catch (error) {
		console.error("[VoiceService] Error updating TTS settings:", error)
		// Send error to webview
		controller.postMessageToWebview({
			type: "grpc_response",
			grpc_response: {
				message: { type: "ttsError", error: error instanceof Error ? error.message : String(error) },
				request_id: "tts-error",
			},
		})
		throw error
	}
}
