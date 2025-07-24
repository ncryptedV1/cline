import { Controller } from "../index"
import { Empty } from "@shared/proto/common"

/**
 * Speak text request
 */
interface SpeakTextRequest {
	text: string
}

/**
 * Convert text to speech and play it
 * @param controller The controller instance
 * @param request SpeakTextRequest containing the text to speak
 * @returns Empty response
 */
export async function speakText(controller: Controller, request: SpeakTextRequest): Promise<Empty> {
	try {
		console.log("[VoiceService] Speak text requested:", request.text?.substring(0, 100))
		await controller.voiceService.speakText(request.text)
		return Empty.create()
	} catch (error) {
		console.error("[VoiceService] Error speaking text:", error)
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
