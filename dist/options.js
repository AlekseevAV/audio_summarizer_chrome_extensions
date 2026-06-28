document.addEventListener("DOMContentLoaded", () => {
  loadSettings();

  document
    .getElementById("saveSettings")
    .addEventListener("click", saveSettings);
});

function loadSettings() {
  chrome.storage.sync.get(
    ["openai_token", "summary_prompt", "transcription_model"],
    (data) => {
      document.getElementById("openaiToken").value = data.openai_token || "";
      document.getElementById("summaryPrompt").value =
        data.summary_prompt || "";
      document.getElementById("transcriptionModel").value =
        data.transcription_model || "gpt-4o-transcribe";
    },
  );
}

function saveSettings() {
  const openai_token = document.getElementById("openaiToken").value;
  const summary_prompt = document.getElementById("summaryPrompt").value;
  const transcription_model =
    document.getElementById("transcriptionModel").value;

  chrome.storage.sync.set(
    { openai_token, summary_prompt, transcription_model },
    () => {
      alert("Settings saved!");
    },
  );
}
