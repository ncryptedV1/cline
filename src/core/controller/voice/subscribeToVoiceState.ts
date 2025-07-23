import { Controller } from "../index"
import { EmptyRequest } from "@shared/proto/common"
import { VoiceState } from "@shared/proto/voice"
import { StreamingResponseHandler, getRequestRegistry } from "../grpc-handler"

// Keep track of active voice state subscriptions
const activeVoiceStateSubscriptions = new Set<StreamingResponseHandler<VoiceState>>()

/**
 * Subscribes to voice recording state changes
 * @param controller The controller instance
 * @param request Empty request
 * @param responseStream The streaming response handler
 * @param requestId The ID of the request (passed by the gRPC handler)
 */
export async function subscribeToVoiceState(
	controller: Controller,
	_request: EmptyRequest,
	responseStream: StreamingResponseHandler<VoiceState>,
	requestId?: string,
): Promise<void> {
	console.log("[VoiceService] Client subscribed to voice state updates")

	// Add this subscription to the active subscriptions
	activeVoiceStateSubscriptions.add(responseStream)

	// Set up event listener for state changes
	const stateChangeHandler = async (state: { isRecording: boolean }) => {
		try {
			const voiceState = VoiceState.create({
				isRecording: state.isRecording,
			})
			await responseStream(voiceState, false) // Not the last message
		} catch (error) {
			console.error("[VoiceService] Error sending voice state update:", error)
			activeVoiceStateSubscriptions.delete(responseStream)
		}
	}

	controller.voiceService.on("stateChange", stateChangeHandler)

	// Register cleanup when the connection is closed
	const cleanup = () => {
		controller.voiceService.off("stateChange", stateChangeHandler)
		activeVoiceStateSubscriptions.delete(responseStream)
		console.log("[VoiceService] Cleaned up voice state subscription")
	}

	// Register the cleanup function with the request registry if we have a requestId
	if (requestId) {
		getRequestRegistry().registerRequest(requestId, cleanup, { type: "voice_state_subscription" }, responseStream)
	}

	// Send initial state
	try {
		const initialState = VoiceState.create({
			isRecording: controller.voiceService.isRecording,
		})
		await responseStream(initialState, false) // Not the last message
	} catch (error) {
		console.error("[VoiceService] Error sending initial voice state:", error)
		activeVoiceStateSubscriptions.delete(responseStream)
	}
}
