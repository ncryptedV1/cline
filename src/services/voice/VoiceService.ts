import { SpeechClient } from "@google-cloud/speech"
import { EventEmitter } from "events"
import { spawn, ChildProcess } from "child_process"
import { Writable } from "stream"

export interface VoiceTranscript {
	text: string
	isFinal: boolean
}

export class VoiceService extends EventEmitter {
	private speechClient: SpeechClient
	private _isRecording = false
	private recognizeStream: any = null
	private microphoneProcess: ChildProcess | null = null
	private audioStream: Writable | null = null

	constructor() {
		super()

		// Initialize Google Cloud Speech client
		// Will use environment variables or default credentials
		this.speechClient = new SpeechClient({
			credentials: {
				client_email: process.env.GOOGLE_CLIENT_EMAIL,
				private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
			},
			projectId: process.env.GOOGLE_PROJECT_ID,
		})
	}

	get isRecording(): boolean {
		return this._isRecording
	}

	async toggleRecording(): Promise<boolean> {
		if (this._isRecording) {
			await this.stopRecording()
		} else {
			await this.startRecording()
		}
		return this._isRecording
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

	async dispose(): Promise<void> {
		await this.stopRecording()
		this.removeAllListeners()
	}
}
