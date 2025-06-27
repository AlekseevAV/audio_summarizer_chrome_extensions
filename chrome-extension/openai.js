export async function transcribe(blob, token) {
  let allSegments = [];
  let text = "";

  const formData = new FormData();
  formData.append("file", blob, `chunk_0.webm`);
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");

  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    },
  );

  const result = await response.json();

  if (response.ok && result.segments) {
    allSegments.push(...result.segments);
    text += result.text + " ";
  } else {
    console.error("Error transcribing chunk", result);
    throw new Error("Failed to transcribe audio");
  }

  return { transcriptionSegments: allSegments, transcription: text };
}

// Splitting text into chunks
function splitTextIntoChunks(text, size) {
  const chunks = [];
  let start = 0;

  if (text.length <= size) {
    return [text];
  }

  while (start < text.length) {
    let end = start + size;

    // Find the next period or end of text
    while (end < text.length && text[end] !== "." && end - start < size + 500) {
      end++;
    }
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks;
}

const apiUrl = "https://api.openai.com/v1/chat/completions";
const maxTokens = 8000;
const approxCharsPerToken = 2;
const chunkSize = maxTokens * approxCharsPerToken;

export async function summarizeText(text, prompt, token) {
  const systemMessage = {
    role: "system",
    content: prompt || "Summarize the following text clearly and concisely.",
  };

  const userMessage = {
    role: "user",
    content: text,
  };

  const payload = {
    model: "gpt-4.1",
    messages: [systemMessage, userMessage],
    temperature: 0.5,
  };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();

  if (!response.ok || !result.choices?.[0]?.message?.content) {
    console.error("OpenAI Error in chunk", i, result);
    throw new Error("Failed to generate summary for chunk");
  }

  let finalSummary = result.choices[0].message.content.trim();

  return finalSummary;
}
