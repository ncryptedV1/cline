import { Controller } from "../index"
import { Empty, EmptyRequest } from "@shared/proto/common"

/**
 * Toggles voice input recording on or off
 * @param controller The controller instance
 * @param request Empty request
 * @returns Empty response
 */
export async function toggleVoiceInput(controller: Controller, request: EmptyRequest): Promise<Empty> {
	try {
		console.log("[VoiceService] Toggle voice input requested")
		const isRecording = await controller.voiceService.toggleRecording()
		console.log("[VoiceService] Recording state after toggle:", isRecording)
		return Empty.create()
	} catch (error) {
		console.error("[VoiceService] Error toggling voice input:", error)
		// Send error to webview
		controller.postMessageToWebview({
			type: "grpc_response",
			grpc_response: {
				message: { type: "voiceError", error: error instanceof Error ? error.message : String(error) },
				request_id: "voice-error",
			},
		})
		throw error
	}
}
