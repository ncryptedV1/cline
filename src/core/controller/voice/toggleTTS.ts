import { Controller } from "../index"
import { Empty, EmptyRequest } from "@shared/proto/common"

/**
 * Toggle TTS response
 */
interface TTSToggleResponse {
	enabled: boolean
}

/**
 * Toggles text-to-speech on or off
 * @param controller The controller instance
 * @param request Empty request
 * @returns TTSToggleResponse with enabled state
 */
export async function toggleTTS(controller: Controller, request: EmptyRequest): Promise<TTSToggleResponse> {
	try {
		console.log("[VoiceService] Toggle TTS requested")
		const enabled = await controller.voiceService.toggleTTS()
		console.log("[VoiceService] TTS state after toggle:", enabled)
		return { enabled }
	} catch (error) {
		console.error("[VoiceService] Error toggling TTS:", error)
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
