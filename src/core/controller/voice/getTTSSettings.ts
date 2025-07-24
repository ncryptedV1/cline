import { Controller } from "../index"
import { EmptyRequest } from "@shared/proto/common"
import { TTSSettingsResponse } from "@shared/proto/voice"

/**
 * Get current TTS settings
 * @param controller The controller instance
 * @param request Empty request
 * @returns TTSSettingsResponse with current settings
 */
export async function getTTSSettings(controller: Controller, request: EmptyRequest): Promise<TTSSettingsResponse> {
	try {
		const settings = controller.voiceService.getTTSSettings()

		// Convert nested server structure to proto response structure
		const response: TTSSettingsResponse = {
			enabled: settings.enabled,
			languageCode: settings.voice.languageCode,
			voiceName: settings.voice.name || "",
			ssmlGender: settings.voice.ssmlGender,
			audioEncoding: settings.audioConfig.audioEncoding,
			speakingRate: settings.audioConfig.speakingRate || 1.0,
			pitch: settings.audioConfig.pitch || 0.0,
			clientEmail: settings.credentials?.client_email || "",
			privateKey: settings.credentials?.private_key || "",
			projectId: settings.credentials?.project_id || "",
		}

		return response
	} catch (error) {
		console.error("[VoiceService] Error getting TTS settings:", error)
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
