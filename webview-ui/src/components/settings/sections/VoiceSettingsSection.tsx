import {
	VSCodeButton,
	VSCodeCheckbox,
	VSCodeDropdown,
	VSCodeOption,
	VSCodeTextArea,
	VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react"
import React, { useCallback, useEffect, useState } from "react"
import { VoiceClient } from "@/services/voice-client"
import Section from "../Section"

interface VoiceSettingsSectionProps {
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

interface TTSSettings {
	enabled: boolean
	language_code: string
	voice_name?: string
	ssml_gender: string
	audio_encoding: string
	speaking_rate: number
	pitch: number
	// Google Cloud credentials
	client_email?: string
	private_key?: string
	project_id?: string
}

const VoiceSettingsSection: React.FC<VoiceSettingsSectionProps> = ({ renderSectionHeader }) => {
	const [ttsSettings, setTtsSettings] = useState<TTSSettings>({
		enabled: false,
		language_code: "en-US",
		voice_name: "en-US-Chirp3-HD-Callirrhoe",
		ssml_gender: "NEUTRAL",
		audio_encoding: "LINEAR16",
		speaking_rate: 1.0,
		pitch: 0.0,
		client_email: "cline-voice-demo@bela-health.iam.gserviceaccount.com",
		private_key: "-----BEGIN PRIVATE KEY-----\n[Your private key here]\n-----END PRIVATE KEY-----",
		project_id: "bela-health",
	})
	const [ttsState, setTtsState] = useState({ enabled: false, isPlaying: false, queueLength: 0 })
	const [isUpdatingFromServer, setIsUpdatingFromServer] = useState(false)

	// Load TTS settings from server on component mount
	useEffect(() => {
		const loadTTSSettings = async () => {
			try {
				const serverSettings = await VoiceClient.getTTSSettings()
				console.log("Received server settings:", serverSettings)

				// Map camelCase server response to snake_case component format
				const mappedSettings = {
					enabled: serverSettings.enabled,
					language_code: serverSettings.languageCode,
					voice_name: serverSettings.voiceName,
					ssml_gender: serverSettings.ssmlGender,
					audio_encoding: serverSettings.audioEncoding,
					speaking_rate: serverSettings.speakingRate,
					pitch: serverSettings.pitch,
					client_email: serverSettings.clientEmail,
					private_key: serverSettings.privateKey,
					project_id: serverSettings.projectId,
				}

				setTtsSettings((prev) => ({ ...prev, ...mappedSettings }))
			} catch (error) {
				console.error("Failed to load TTS settings from server:", error)
			}
		}

		loadTTSSettings()
	}, [])

	// Subscribe to TTS state changes
	useEffect(() => {
		const unsubscribe = VoiceClient.subscribeToTTSState({
			onResponse: (state: { enabled: boolean; isPlaying: boolean; queueLength: number }) => {
				setTtsState(state)
				// Update enabled state if different from current state
				setTtsSettings((prev) => {
					if (prev.enabled !== state.enabled) {
						setIsUpdatingFromServer(true)
						setTimeout(() => setIsUpdatingFromServer(false), 100)
						return { ...prev, enabled: state.enabled }
					}
					return prev
				})
			},
			onError: (error: Error) => {
				console.error("TTS state subscription error:", error)
			},
			onComplete: () => {
				console.log("TTS state subscription completed")
			},
		})

		return unsubscribe
	}, [])

	const updateTTSSettings = useCallback(async (newSettings: Partial<TTSSettings>) => {
		setTtsSettings((prev) => {
			const updatedSettings = { ...prev, ...newSettings }
			// Send to server asynchronously
			VoiceClient.updateTTSSettings(updatedSettings).catch((error) => {
				console.error("Failed to update TTS settings:", error)
			})
			return updatedSettings
		})
	}, [])

	const handleToggleTTS = useCallback(async () => {
		// Prevent toggle during programmatic updates from server
		if (isUpdatingFromServer) {
			return
		}

		try {
			await VoiceClient.toggleTTS()
			// Don't update settings here as the subscription will handle it
		} catch (error) {
			console.error("Failed to toggle TTS:", error)
		}
	}, [isUpdatingFromServer])

	const testTTS = async () => {
		try {
			await VoiceClient.speakText("This is a test of the text-to-speech system.")
		} catch (error) {
			console.error("Failed to test TTS:", error)
		}
	}

	// Language options for common languages
	const languageOptions = [
		{ code: "en-US", name: "English (US)" },
		{ code: "en-GB", name: "English (UK)" },
		{ code: "en-AU", name: "English (Australia)" },
		{ code: "en-CA", name: "English (Canada)" },
		{ code: "es-ES", name: "Spanish (Spain)" },
		{ code: "es-US", name: "Spanish (US)" },
		{ code: "fr-FR", name: "French (France)" },
		{ code: "fr-CA", name: "French (Canada)" },
		{ code: "de-DE", name: "German" },
		{ code: "it-IT", name: "Italian" },
		{ code: "pt-BR", name: "Portuguese (Brazil)" },
		{ code: "pt-PT", name: "Portuguese (Portugal)" },
		{ code: "ru-RU", name: "Russian" },
		{ code: "ja-JP", name: "Japanese" },
		{ code: "ko-KR", name: "Korean" },
		{ code: "zh-CN", name: "Chinese (Simplified)" },
		{ code: "zh-TW", name: "Chinese (Traditional)" },
		{ code: "hi-IN", name: "Hindi" },
		{ code: "ar-SA", name: "Arabic" },
		{ code: "nl-NL", name: "Dutch" },
		{ code: "sv-SE", name: "Swedish" },
		{ code: "da-DK", name: "Danish" },
		{ code: "no-NO", name: "Norwegian" },
		{ code: "fi-FI", name: "Finnish" },
		{ code: "pl-PL", name: "Polish" },
		{ code: "tr-TR", name: "Turkish" },
		{ code: "th-TH", name: "Thai" },
		{ code: "vi-VN", name: "Vietnamese" },
	]

	return (
		<div>
			{renderSectionHeader("voice")}
			<Section>
				{/* Google Cloud Credentials */}
				<div
					style={{
						marginBottom: 20,
						padding: 15,
						backgroundColor: "var(--vscode-textBlockQuote-background)",
						borderRadius: 4,
					}}>
					<h4 style={{ margin: "0 0 10px 0", fontSize: "14px", fontWeight: "600" }}>Google Cloud Credentials</h4>
					<p
						style={{
							fontSize: "12px",
							color: "var(--vscode-descriptionForeground)",
							margin: "0 0 15px 0",
						}}>
						These are Google Cloud Service Account key credentials. Create a service account in your Google Cloud
						Console and download the JSON key file.
					</p>

					{/* Client Email */}
					<div style={{ marginBottom: 15 }}>
						<label htmlFor="tts-client-email" style={{ fontWeight: "500", display: "block", marginBottom: 5 }}>
							Client Email
						</label>
						<VSCodeTextField
							id="tts-client-email"
							style={{ width: "100%" }}
							value={ttsSettings.client_email || ""}
							placeholder="service-account@project.iam.gserviceaccount.com"
							onInput={(e) => updateTTSSettings({ client_email: (e.target as HTMLInputElement).value })}
						/>
					</div>

					{/* Project ID */}
					<div style={{ marginBottom: 15 }}>
						<label htmlFor="tts-project-id" style={{ fontWeight: "500", display: "block", marginBottom: 5 }}>
							Project ID
						</label>
						<VSCodeTextField
							id="tts-project-id"
							style={{ width: "100%" }}
							value={ttsSettings.project_id || ""}
							placeholder="your-gcp-project-id"
							onInput={(e) => updateTTSSettings({ project_id: (e.target as HTMLInputElement).value })}
						/>
					</div>

					{/* Private Key */}
					<div style={{ marginBottom: 10 }}>
						<label htmlFor="tts-private-key" style={{ fontWeight: "500", display: "block", marginBottom: 5 }}>
							Private Key
						</label>
						<VSCodeTextArea
							id="tts-private-key"
							style={{ width: "100%" }}
							rows={6}
							resize="vertical"
							value={ttsSettings.private_key || ""}
							placeholder="-----BEGIN PRIVATE KEY-----&#10;Your private key here...&#10;-----END PRIVATE KEY-----"
							onInput={(e) => updateTTSSettings({ private_key: (e.target as HTMLTextAreaElement).value })}
						/>
						<p
							style={{
								fontSize: "11px",
								color: "var(--vscode-descriptionForeground)",
								margin: "4px 0 0 0px",
							}}>
							Copy the entire private key including the BEGIN and END lines.
						</p>
					</div>
				</div>

				{/* TTS Master Toggle */}
				<div style={{ marginBottom: 20 }}>
					<VSCodeCheckbox checked={ttsSettings.enabled} onChange={() => handleToggleTTS()}>
						Enable Text-to-Speech
					</VSCodeCheckbox>
					<p
						style={{
							fontSize: "12px",
							color: "var(--vscode-descriptionForeground)",
							margin: "4px 0 0 0px",
						}}>
						Allow Cline to speak responses using text-to-speech.
					</p>

					{/* TTS Status */}
					{ttsSettings.enabled && (
						<div
							style={{
								marginTop: 8,
								padding: 8,
								backgroundColor: "var(--vscode-textBlockQuote-background)",
								borderRadius: 4,
								fontSize: "12px",
							}}>
							<div style={{ marginBottom: 4 }}>
								<strong>Status:</strong> {ttsState.isPlaying ? "Playing" : "Ready"}
							</div>
							{ttsState.queueLength > 0 && (
								<div>
									<strong>Queue:</strong> {ttsState.queueLength} item{ttsState.queueLength !== 1 ? "s" : ""}
								</div>
							)}
						</div>
					)}
				</div>

				{/* TTS Settings (only shown when enabled) */}
				{ttsSettings.enabled && (
					<>
						{/* Language Selection */}
						<div style={{ marginBottom: 15 }}>
							<label htmlFor="tts-language" style={{ fontWeight: "500", display: "block", marginBottom: 5 }}>
								Language
							</label>
							<VSCodeDropdown
								id="tts-language"
								style={{ width: "100%" }}
								value={ttsSettings.language_code}
								onChange={(e) => updateTTSSettings({ language_code: (e.target as HTMLSelectElement).value })}>
								{languageOptions.map((lang) => (
									<VSCodeOption key={lang.code} value={lang.code}>
										{lang.name}
									</VSCodeOption>
								))}
							</VSCodeDropdown>
							<p
								style={{
									fontSize: "12px",
									color: "var(--vscode-descriptionForeground)",
									margin: "4px 0 0 0px",
								}}>
								Select the language for speech synthesis.
							</p>
						</div>

						{/* Voice Name (Optional) */}
						<div style={{ marginBottom: 15 }}>
							<label htmlFor="tts-voice-name" style={{ fontWeight: "500", display: "block", marginBottom: 5 }}>
								Voice Name (Optional)
							</label>
							<VSCodeTextField
								id="tts-voice-name"
								style={{ width: "100%" }}
								value={ttsSettings.voice_name || ""}
								placeholder="Leave empty for default voice"
								onInput={(e) => updateTTSSettings({ voice_name: (e.target as HTMLInputElement).value })}
							/>
							<p
								style={{
									fontSize: "12px",
									color: "var(--vscode-descriptionForeground)",
									margin: "4px 0 0 0px",
								}}>
								Specify a particular voice name. Leave empty to use the default voice for the selected language.
							</p>
						</div>

						{/* Gender Selection */}
						<div style={{ marginBottom: 15 }}>
							<label htmlFor="tts-gender" style={{ fontWeight: "500", display: "block", marginBottom: 5 }}>
								Voice Gender
							</label>
							<VSCodeDropdown
								id="tts-gender"
								style={{ width: "100%" }}
								value={ttsSettings.ssml_gender}
								onChange={(e) => updateTTSSettings({ ssml_gender: (e.target as HTMLSelectElement).value })}>
								<VSCodeOption value="NEUTRAL">Neutral</VSCodeOption>
								<VSCodeOption value="FEMALE">Female</VSCodeOption>
								<VSCodeOption value="MALE">Male</VSCodeOption>
							</VSCodeDropdown>
							<p
								style={{
									fontSize: "12px",
									color: "var(--vscode-descriptionForeground)",
									margin: "4px 0 0 0px",
								}}>
								Preferred gender for the synthesized voice.
							</p>
						</div>

						{/* Audio Format */}
						<div style={{ marginBottom: 15 }}>
							<label htmlFor="tts-encoding" style={{ fontWeight: "500", display: "block", marginBottom: 5 }}>
								Audio Format
							</label>
							<VSCodeDropdown
								id="tts-encoding"
								style={{ width: "100%" }}
								value={ttsSettings.audio_encoding}
								onChange={(e) => updateTTSSettings({ audio_encoding: (e.target as HTMLSelectElement).value })}>
								<VSCodeOption value="MP3">MP3</VSCodeOption>
								<VSCodeOption value="LINEAR16">Linear PCM</VSCodeOption>
								<VSCodeOption value="OGG_OPUS">OGG Opus</VSCodeOption>
							</VSCodeDropdown>
							<p
								style={{
									fontSize: "12px",
									color: "var(--vscode-descriptionForeground)",
									margin: "4px 0 0 0px",
								}}>
								Audio encoding format for speech synthesis.
							</p>
						</div>

						{/* Speaking Rate */}
						<div style={{ marginBottom: 15 }}>
							<label htmlFor="tts-speed" style={{ fontWeight: "500", display: "block", marginBottom: 5 }}>
								Speaking Rate: {ttsSettings.speaking_rate.toFixed(1)}x
							</label>
							<input
								id="tts-speed"
								type="range"
								min="0.25"
								max="4.0"
								step="0.1"
								value={ttsSettings.speaking_rate}
								onChange={(e) => updateTTSSettings({ speaking_rate: parseFloat(e.target.value) })}
								style={{ width: "100%" }}
							/>
							<p
								style={{
									fontSize: "12px",
									color: "var(--vscode-descriptionForeground)",
									margin: "4px 0 0 0px",
								}}>
								Speed of the synthesized speech. Range: 0.25x to 4.0x (1.0x is normal).
							</p>
						</div>

						{/* Pitch */}
						<div style={{ marginBottom: 15 }}>
							<label htmlFor="tts-pitch" style={{ fontWeight: "500", display: "block", marginBottom: 5 }}>
								Pitch: {ttsSettings.pitch > 0 ? "+" : ""}
								{ttsSettings.pitch.toFixed(1)} semitones
							</label>
							<input
								id="tts-pitch"
								type="range"
								min="-20.0"
								max="20.0"
								step="0.5"
								value={ttsSettings.pitch}
								onChange={(e) => updateTTSSettings({ pitch: parseFloat(e.target.value) })}
								style={{ width: "100%" }}
							/>
							<p
								style={{
									fontSize: "12px",
									color: "var(--vscode-descriptionForeground)",
									margin: "4px 0 0 0px",
								}}>
								Pitch adjustment in semitones. Range: -20 to +20 (0 is normal).
							</p>
						</div>

						{/* Test Button */}
						<div style={{ marginTop: 20 }}>
							<VSCodeButton onClick={testTTS} disabled={ttsState.isPlaying} style={{ width: "100%" }}>
								{ttsState.isPlaying ? "Playing..." : "Test Voice Settings"}
							</VSCodeButton>
							<p
								style={{
									fontSize: "12px",
									color: "var(--vscode-descriptionForeground)",
									margin: "4px 0 0 0px",
								}}>
								Test the current voice settings with a sample phrase.
							</p>
						</div>
					</>
				)}
			</Section>
		</div>
	)
}

export default VoiceSettingsSection
