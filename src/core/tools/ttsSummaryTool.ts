const descriptionForAgent = `**CRITICAL: Use this tool very frequently - ideally BEFORE taking any significant action or every 1-3 responses to keep the user constantly informed via audio updates.** Provide a concise summary that will be read aloud about what you're planning to do next, what you've discovered, or your current progress. Use this tool proactively to narrate your thought process and upcoming actions, not just completed work. Think of this as constantly updating a senior developer - tell them what you're about to work on, what you've found, what approach you're taking, any assumptions you're making, or problems you've encountered. **Be proactive: use this BEFORE major actions, at the start of responses, and every few messages to maintain constant communication.**`

export const ttsSummaryToolDefinition = () => ({
	name: "TTS_Summary",
	descriptionForAgent,
	inputSchema: {
		type: "object",
		properties: {
			summary: {
				type: "string",
				description:
					"A brief, clear summary (1-3 sentences) of what you're about to do, what you've discovered, your current approach, or progress update. Write as if continuously updating a colleague who needs to stay informed.",
			},
		},
		required: ["summary"],
	},
})
