import { Controller } from "../index"
import { EmptyRequest } from "@shared/proto/common"
import { VoiceTranscript as VoiceTranscriptProto } from "@shared/proto/voice"
import { VoiceTranscript } from "../../../services/voice/VoiceService"
import { StreamingResponseHandler, getRequestRegistry } from "../grpc-handler"

// Keep track of active voice transcript subscriptions
const activeVoiceTranscriptSubscriptions = new Set<StreamingResponseHandler<VoiceTranscriptProto>>()

/**
 * Subscribes to voice transcription updates (both interim and final)
 * @param controller The controller instance
 * @param request Empty request
 * @param responseStream The streaming response handler
 * @param requestId The ID of the request (passed by the gRPC handler)
 */
export async function subscribeToVoiceTranscripts(
	controller: Controller,
	_request: EmptyRequest,
	responseStream: StreamingResponseHandler<VoiceTranscriptProto>,
	requestId?: string,
): Promise<void> {
	console.log("[VoiceService] Client subscribed to voice transcript updates")

	// Add this subscription to the active subscriptions
	activeVoiceTranscriptSubscriptions.add(responseStream)

	// Set up event listener for transcript updates
	const transcriptHandler = async (transcript: VoiceTranscript) => {
		try {
			const voiceTranscript = VoiceTranscriptProto.create({
				text: transcript.text,
				isFinal: transcript.isFinal,
			})
			await responseStream(voiceTranscript, false) // Not the last message
		} catch (error) {
			console.error("[VoiceService] Error sending voice transcript update:", error)
			activeVoiceTranscriptSubscriptions.delete(responseStream)
		}
	}

	controller.voiceService.on("transcript", transcriptHandler)

	// Register cleanup when the connection is closed
	const cleanup = () => {
		controller.voiceService.off("transcript", transcriptHandler)
		activeVoiceTranscriptSubscriptions.delete(responseStream)
		console.log("[VoiceService] Cleaned up voice transcript subscription")
	}

	// Register the cleanup function with the request registry if we have a requestId
	if (requestId) {
		getRequestRegistry().registerRequest(requestId, cleanup, { type: "voice_transcript_subscription" }, responseStream)
	}
}
