import { SpeechClient } from "@google-cloud/speech"
import { TextToSpeechClient } from "@google-cloud/text-to-speech"
import { EventEmitter } from "events"
import { spawn, ChildProcess } from "child_process"
import { Writable } from "stream"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import * as ttsProtos from "@google-cloud/text-to-speech/build/protos/protos"

export interface VoiceTranscript {
	text: string
	isFinal: boolean
}

export interface TTSSettings {
	enabled: boolean
	voice: {
		languageCode: string
		name?: string
		ssmlGender: "NEUTRAL" | "FEMALE" | "MALE"
	}
	audioConfig: {
		audioEncoding: "MP3" | "LINEAR16" | "OGG_OPUS"
		speakingRate?: number
		pitch?: number
	}
	credentials?: {
		client_email: string
		private_key: string
		project_id: string
	}
}

interface AudioQueueItem {
	filePath: string
	process?: ChildProcess
}

export class VoiceService extends EventEmitter {
	private speechClient: SpeechClient | null = null
	private textToSpeechClient: TextToSpeechClient | null = null
	private _isRecording = false
	private _ttsEnabled = false
	private recognizeStream: any = null
	private microphoneProcess: ChildProcess | null = null
	private audioStream: Writable | null = null
	private audioQueue: AudioQueueItem[] = []
	private isPlayingAudio = false
	private ttsSettings: TTSSettings
	private tempDir: string

	constructor() {
		super()

		// Create temp directory for audio files
		this.tempDir = path.join(os.tmpdir(), "cline-voice")
		if (!fs.existsSync(this.tempDir)) {
			fs.mkdirSync(this.tempDir, { recursive: true })
		}

		// Default TTS settings with default credentials
		this.ttsSettings = {
			enabled: false,
			voice: {
				languageCode: "en-US",
				name: "en-US-Chirp3-HD-Callirrhoe",
				ssmlGender: "NEUTRAL",
			},
			audioConfig: {
				audioEncoding: "OGG_OPUS",
				speakingRate: 1.0,
				pitch: 0.0,
			},
			credentials: {
				client_email: "cline-voice-demo@bela-health.iam.gserviceaccount.com",
				private_key: "xxx",
				project_id: "bela-health",
			},
		}

		// Initialize Google Cloud clients with default credentials
		this.initializeGoogleCloudClients()
	}

	private initializeGoogleCloudClients(): void {
		if (!this.ttsSettings.credentials) {
			console.warn("[VoiceService] No credentials provided, Google Cloud clients not initialized")
			return
		}

		try {
			const credentials = {
				client_email: this.ttsSettings.credentials.client_email,
				private_key: this.ttsSettings.credentials.private_key,
			}
			const projectId = this.ttsSettings.credentials.project_id

			this.speechClient = new SpeechClient({
				credentials,
				projectId,
			})

			this.textToSpeechClient = new TextToSpeechClient({
				credentials,
				projectId,
			})

			console.log("[VoiceService] Google Cloud clients initialized successfully")
		} catch (error) {
			console.error("[VoiceService] Failed to initialize Google Cloud clients:", error)
			this.speechClient = null
			this.textToSpeechClient = null
		}
	}

	get isRecording(): boolean {
		return this._isRecording
	}

	get ttsEnabled(): boolean {
		return this._ttsEnabled
	}

	async toggleRecording(): Promise<boolean> {
		if (this._isRecording) {
			await this.stopRecording()
		} else {
			await this.startRecording()
		}
		return this._isRecording
	}

	async toggleTTS(): Promise<boolean> {
		this._ttsEnabled = !this._ttsEnabled
		this.ttsSettings.enabled = this._ttsEnabled
		this.emit("ttsStateChange", { enabled: this._ttsEnabled })
		console.log(`[VoiceService] TTS ${this._ttsEnabled ? "enabled" : "disabled"}`)

		// If disabling, stop any current audio playback
		if (!this._ttsEnabled) {
			this.stopAllAudio()
		}

		return this._ttsEnabled
	}

	async updateTTSSettings(settings: Partial<TTSSettings>): Promise<void> {
		const previousCredentials = this.ttsSettings.credentials
		this.ttsSettings = { ...this.ttsSettings, ...settings }

		// Only update _ttsEnabled if enabled was explicitly provided in the settings
		// This prevents race conditions with toggleTTS()
		if (settings.enabled !== undefined) {
			this._ttsEnabled = this.ttsSettings.enabled
		}

		// Check if credentials changed and reinitialize clients if needed
		const credentialsChanged =
			settings.credentials &&
			(!previousCredentials ||
				settings.credentials.client_email !== previousCredentials.client_email ||
				settings.credentials.private_key !== previousCredentials.private_key ||
				settings.credentials.project_id !== previousCredentials.project_id)

		if (credentialsChanged) {
			console.log("[VoiceService] Credentials changed, reinitializing Google Cloud clients")
			this.initializeGoogleCloudClients()
		}

		this.emit("ttsSettingsChanged", this.ttsSettings)
		console.log("[VoiceService] TTS settings updated")
	}

	getTTSSettings(): TTSSettings {
		return { ...this.ttsSettings }
	}

	private async startRecording(): Promise<void> {
		if (this._isRecording) {
			console.log("[VoiceService] Already recording")
			return
		}

		try {
			console.log("[VoiceService] Starting voice recording...")
			this._isRecording = true
			this.emit("stateChange", { isRecording: true })

			// Set up Google Cloud Speech streaming recognition
			if (!this.speechClient) {
				throw new Error("Speech client not initialized. Please configure Google Cloud credentials.")
			}

			this.recognizeStream = this.speechClient
				.streamingRecognize({
					config: {
						encoding: "LINEAR16" as any,
						sampleRateHertz: 16000,
						languageCode: "en-US",
						enableAutomaticPunctuation: true,
					},
					interimResults: true,
				})
				.on("data", (data: any) => {
					if (data.results && data.results[0]) {
						const transcript = data.results[0].alternatives[0].transcript
						const isFinal = data.results[0].isFinal

						console.log(`[VoiceService] Transcript (${isFinal ? "final" : "interim"}):`, transcript)

						this.emit("transcript", {
							text: transcript,
							isFinal: isFinal,
						})
					}
				})
				.on("error", (error: Error) => {
					console.error("[VoiceService] Speech recognition error:", error)
					this.emit("error", error)
					this.stopRecording()
				})

			// Start microphone capture using SoX (cross-platform)
			this.startMicrophoneCapture()
		} catch (error) {
			console.error("[VoiceService] Failed to start recording:", error)
			this._isRecording = false
			this.emit("stateChange", { isRecording: false })
			this.emit("error", error instanceof Error ? error : new Error(String(error)))
		}
	}

	private async startMicrophoneCapture(): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				// Use SoX (Sound eXchange) to capture audio from microphone
				// This is a cross-platform solution that should work on macOS, Linux, and Windows
				const soxArgs = [
					"-t",
					"coreaudio", // macOS input (will fall back to other drivers)
					"-d", // default input device
					"-t",
					"raw", // output format
					"-b",
					"16", // 16-bit
					"-e",
					"signed-integer", // signed integer encoding
					"-c",
					"1", // mono
					"-r",
					"16000", // 16kHz sample rate
					"-", // output to stdout
				]

				// Try different audio drivers based on platform
				const platform = process.platform
				if (platform === "darwin") {
					soxArgs[1] = "coreaudio"
				} else if (platform === "linux") {
					soxArgs[1] = "alsa"
				} else if (platform === "win32") {
					soxArgs[1] = "waveaudio"
				}

				console.log("[VoiceService] Starting microphone capture with SoX...")
				this.microphoneProcess = spawn("sox", soxArgs)

				this.microphoneProcess.stdout?.on("data", (data) => {
					if (this.recognizeStream && !this.recognizeStream.destroyed) {
						this.recognizeStream.write(data)
					}
				})

				this.microphoneProcess.stderr?.on("data", (data) => {
					console.error("[VoiceService] SoX stderr:", data.toString())
				})

				this.microphoneProcess.on("error", (error) => {
					console.error("[VoiceService] Microphone process error:", error)
					reject(error)
				})

				this.microphoneProcess.on("close", (code) => {
					console.log("[VoiceService] Microphone process closed with code:", code)
				})

				// Give it a moment to start
				setTimeout(() => {
					if (this.microphoneProcess && !this.microphoneProcess.killed) {
						resolve()
					} else {
						reject(new Error("Failed to start microphone capture"))
					}
				}, 500)
			} catch (error) {
				console.error("[VoiceService] Failed to start microphone capture:", error)
				reject(error)
			}
		})
	}

	private async stopRecording(): Promise<void> {
		if (!this._isRecording) {
			console.log("[VoiceService] Not currently recording")
			return
		}

		try {
			console.log("[VoiceService] Stopping voice recording...")
			this._isRecording = false
			this.emit("stateChange", { isRecording: false })

			// Stop microphone capture
			if (this.microphoneProcess) {
				this.microphoneProcess.kill("SIGTERM")
				this.microphoneProcess = null
			}

			// End speech recognition stream
			if (this.recognizeStream) {
				this.recognizeStream.end()
				this.recognizeStream = null
			}
		} catch (error) {
			console.error("[VoiceService] Error stopping recording:", error)
			this.emit("error", error instanceof Error ? error : new Error(String(error)))
		}
	}

	getRecordingState(): boolean {
		return this._isRecording
	}

	// TTS Methods using SoX for playback
	async speakText(text: string): Promise<void> {
		if (!this._ttsEnabled || !text.trim()) {
			return
		}

		try {
			console.log(`[VoiceService] Converting text to speech: "${text.substring(0, 100)}${text.length > 100 ? "..." : ""}"`)

			if (!this.textToSpeechClient) {
				throw new Error("Text-to-Speech client not initialized. Please configure Google Cloud credentials.")
			}

			// Prepare the request
			const request: ttsProtos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
				input: { text: text },
				voice: {
					languageCode: this.ttsSettings.voice.languageCode,
					name: this.ttsSettings.voice.name,
					ssmlGender: this.ttsSettings.voice.ssmlGender,
				},
				audioConfig: {
					audioEncoding: this.ttsSettings.audioConfig.audioEncoding,
					speakingRate: this.ttsSettings.audioConfig.speakingRate,
					pitch: this.ttsSettings.audioConfig.pitch,
				},
			}

			// Perform the text-to-speech request
			const [response] = await this.textToSpeechClient.synthesizeSpeech(request)

			if (response.audioContent) {
				await this.playAudioWithSoX(response.audioContent as Buffer)
			}
		} catch (error) {
			console.error("[VoiceService] TTS error:", error)
			this.emit("error", error instanceof Error ? error : new Error(String(error)))
		}
	}

	private async playAudioWithSoX(audioBuffer: Buffer): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				// Create a temporary file for the audio
				const audioExtensions = {
					MP3: "mp3",
					OGG_OPUS: "ogg",
					LINEAR16: "wav",
				}
				const audioExtension = audioExtensions[this.ttsSettings.audioConfig.audioEncoding] || "wav"
				const tempFilePath = path.join(this.tempDir, `tts_${Date.now()}.${audioExtension}`)

				// Write audio buffer to file
				fs.writeFileSync(tempFilePath, audioBuffer)

				// Add to queue
				const queueItem: AudioQueueItem = { filePath: tempFilePath }
				this.audioQueue.push(queueItem)

				// Start playing if not already playing
				if (!this.isPlayingAudio) {
					this.playNextAudio()
				}

				resolve()
			} catch (error) {
				reject(error)
			}
		})
	}

	private playNextAudio(): void {
		if (this.audioQueue.length === 0) {
			this.isPlayingAudio = false
			this.emit("ttsStateChange", {
				enabled: this._ttsEnabled,
				isPlaying: false,
				queueLength: 0,
			})
			return
		}

		if (!this.isPlayingAudio) {
			this.isPlayingAudio = true
			const queueItem = this.audioQueue[0]

			this.emit("ttsStateChange", {
				enabled: this._ttsEnabled,
				isPlaying: true,
				queueLength: this.audioQueue.length,
			})

			// Use SoX to play the audio file
			const soxArgs = ["-t", this.getAudioType(queueItem.filePath), queueItem.filePath, "-d"]

			console.log(`[VoiceService] Playing audio with SoX: ${queueItem.filePath}`)
			queueItem.process = spawn("sox", soxArgs)

			queueItem.process.on("close", (code) => {
				console.log(`[VoiceService] SoX playback process closed with code: ${code}`)

				// Clean up temp file
				try {
					if (fs.existsSync(queueItem.filePath)) {
						fs.unlinkSync(queueItem.filePath)
					}
				} catch (error) {
					console.error("[VoiceService] Error cleaning up temp audio file:", error)
				}

				// Remove from queue and play next
				this.audioQueue = this.audioQueue.filter((item) => item !== queueItem)
				this.playNextAudio()
			})

			queueItem.process.on("error", (error) => {
				console.error("[VoiceService] SoX playback error:", error)

				// Clean up and continue with next
				try {
					if (fs.existsSync(queueItem.filePath)) {
						fs.unlinkSync(queueItem.filePath)
					}
				} catch (cleanupError) {
					console.error("[VoiceService] Error cleaning up temp audio file:", cleanupError)
				}

				this.audioQueue = this.audioQueue.filter((item) => item !== queueItem)
				this.playNextAudio()
			})

			queueItem.process.stderr?.on("data", (data) => {
				// SoX might output progress info to stderr, which is normal
				console.log(`[VoiceService] SoX playback: ${data.toString().trim()}`)
			})
		}
	}

	private getAudioType(filePath: string): string {
		const ext = path.extname(filePath).toLowerCase()
		switch (ext) {
			case ".mp3":
				return "mp3"
			case ".wav":
				return "wav"
			case ".ogg":
				return "ogg"
			default:
				return "mp3"
		}
	}

	private stopAllAudio(): void {
		// Stop all queued audio and clean up temp files
		this.audioQueue.forEach((item) => {
			if (item.process) {
				item.process.kill("SIGTERM")
			}
			try {
				if (fs.existsSync(item.filePath)) {
					fs.unlinkSync(item.filePath)
				}
			} catch (error) {
				console.error("[VoiceService] Error cleaning up temp audio file:", error)
			}
		})
		this.audioQueue = []
		this.isPlayingAudio = false

		this.emit("ttsStateChange", {
			enabled: this._ttsEnabled,
			isPlaying: false,
			queueLength: 0,
		})

		console.log("[VoiceService] All audio stopped")
	}

	getTTSState(): { enabled: boolean; isPlaying: boolean; queueLength: number } {
		return {
			enabled: this._ttsEnabled,
			isPlaying: this.isPlayingAudio,
			queueLength: this.audioQueue.length,
		}
	}

	async dispose(): Promise<void> {
		await this.stopRecording()
		this.stopAllAudio()

		// Clean up temp directory
		try {
			if (fs.existsSync(this.tempDir)) {
				const files = fs.readdirSync(this.tempDir)
				for (const file of files) {
					fs.unlinkSync(path.join(this.tempDir, file))
				}
				fs.rmdirSync(this.tempDir)
			}
		} catch (error) {
			console.error("[VoiceService] Error cleaning up temp directory:", error)
		}

		this.removeAllListeners()
	}
}
