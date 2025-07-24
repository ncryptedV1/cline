import { Controller } from "../index"
import { EmptyRequest } from "@shared/proto/common"
import { StreamingResponseHandler, getRequestRegistry } from "../grpc-handler"

/**
 * TTS state response
 */
interface TTSState {
	enabled: boolean
	isPlaying: boolean
	queueLength: number
}

// Keep track of active TTS state subscriptions
const activeTTSStateSubscriptions = new Set<StreamingResponseHandler<TTSState>>()

/**
 * Subscribes to TTS state changes
 * @param controller The controller instance
 * @param request Empty request
 * @param responseStream The streaming response handler
 * @param requestId The ID of the request (passed by the gRPC handler)
 */
export async function subscribeToTTSState(
	controller: Controller,
	_request: EmptyRequest,
	responseStream: StreamingResponseHandler<TTSState>,
	requestId?: string,
): Promise<void> {
	console.log("[VoiceService] Client subscribed to TTS state updates")

	// Add this subscription to the active subscriptions
	activeTTSStateSubscriptions.add(responseStream)

	// Set up event listener for TTS state changes
	const ttsStateChangeHandler = async (state: { enabled: boolean }) => {
		try {
			const ttsStateData = controller.voiceService.getTTSState()
			const ttsState: TTSState = {
				enabled: ttsStateData.enabled,
				isPlaying: ttsStateData.isPlaying,
				queueLength: ttsStateData.queueLength,
			}
			await responseStream(ttsState, false) // Not the last message
		} catch (error) {
			console.error("[VoiceService] Error sending TTS state update:", error)
			activeTTSStateSubscriptions.delete(responseStream)
		}
	}

	// Set up event listener for TTS settings changes
	const ttsSettingsChangeHandler = async () => {
		try {
			const ttsStateData = controller.voiceService.getTTSState()
			const ttsState: TTSState = {
				enabled: ttsStateData.enabled,
				isPlaying: ttsStateData.isPlaying,
				queueLength: ttsStateData.queueLength,
			}
			await responseStream(ttsState, false) // Not the last message
		} catch (error) {
			console.error("[VoiceService] Error sending TTS settings update:", error)
			activeTTSStateSubscriptions.delete(responseStream)
		}
	}

	controller.voiceService.on("ttsStateChange", ttsStateChangeHandler)
	controller.voiceService.on("ttsSettingsChanged", ttsSettingsChangeHandler)

	// Register cleanup when the connection is closed
	const cleanup = () => {
		controller.voiceService.off("ttsStateChange", ttsStateChangeHandler)
		controller.voiceService.off("ttsSettingsChanged", ttsSettingsChangeHandler)
		activeTTSStateSubscriptions.delete(responseStream)
		console.log("[VoiceService] Cleaned up TTS state subscription")
	}

	// Register the cleanup function with the request registry if we have a requestId
	if (requestId) {
		getRequestRegistry().registerRequest(requestId, cleanup, { type: "tts_state_subscription" }, responseStream)
	}

	// Send initial state
	try {
		const ttsStateData = controller.voiceService.getTTSState()
		const initialState: TTSState = {
			enabled: ttsStateData.enabled,
			isPlaying: ttsStateData.isPlaying,
			queueLength: ttsStateData.queueLength,
		}
		await responseStream(initialState, false) // Not the last message
	} catch (error) {
		console.error("[VoiceService] Error sending initial TTS state:", error)
		activeTTSStateSubscriptions.delete(responseStream)
	}
}
