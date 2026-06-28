// PCM streaming
export async function startPCMStreaming(audioContext, combinedStream, ws) {
  await audioContext.audioWorklet.addModule(
    chrome.runtime.getURL("pcm-processor.js"),
  );

  const source = audioContext.createMediaStreamSource(combinedStream);
  const workletNode = new AudioWorkletNode(audioContext, "pcm-processor");
  source.connect(workletNode);

  workletNode.port.onmessage = (event) => {
    const float32 = event.data;
    const pcm16 = floatTo16BitPCM(float32);
    const base64 = arrayBufferToBase64(pcm16.buffer);

    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: base64,
        }),
      );
    }
  };

  return workletNode;
}

function floatTo16BitPCM(float32Array) {
  const result = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    result[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return result;
}

function arrayBufferToBase64(buffer) {
  const uint8 = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}
