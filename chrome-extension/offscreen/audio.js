// Above this many buffered bytes on the socket we drop PCM chunks instead of
// piling them up - prevents unbounded memory/latency growth on a slow network.
const MAX_BUFFERED_BYTES = 1 << 20; // ~1 MB

// PCM streaming. `getSocket` returns the socket to send to (resolved per chunk
// so reconnects transparently retarget the stream to the new socket).
export async function startPCMStreaming(audioContext, combinedStream, getSocket) {
  await audioContext.audioWorklet.addModule(
    chrome.runtime.getURL("pcm-processor.js"),
  );

  const source = audioContext.createMediaStreamSource(combinedStream);
  const workletNode = new AudioWorkletNode(audioContext, "pcm-processor");
  source.connect(workletNode);

  workletNode.port.onmessage = (event) => {
    const ws = getSocket();

    // Drop while disconnected/reconnecting (socket not open) or when the
    // socket is backed up. Lost audio is preferable to runaway buffering.
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > MAX_BUFFERED_BYTES) return;

    const float32 = event.data;
    const pcm16 = floatTo16BitPCM(float32);
    const base64 = arrayBufferToBase64(pcm16.buffer);

    ws.send(
      JSON.stringify({
        type: "input_audio_buffer.append",
        audio: base64,
      }),
    );
  };

  return workletNode;
}

export function floatTo16BitPCM(float32Array) {
  const result = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    result[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return result;
}

export function arrayBufferToBase64(buffer) {
  const uint8 = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}
