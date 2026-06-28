// Default configuration values shared across the extension.

export const DEFAULT_SUMMARY_MODEL = "gpt-5.2-2025-12-11";

export const DEFAULT_SUMMARY_SYSTEM_PROMPT = `You are a senior product and engineering manager.
Your task is to create a concise, structured meeting summary
that is suitable for stakeholders who were not present.

The summary must:
- Be readable in under 3 minutes
- Focus on outcomes, not discussion flow
- Clearly separate facts, interpretations, decisions, and actions
- Avoid emotions, dialogue, and personal remarks
- Explicitly mark uncertainty and open questions`;

export const DEFAULT_SUMMARY_PROMPT =
  "Make a concise structured summary of this transcription.";
