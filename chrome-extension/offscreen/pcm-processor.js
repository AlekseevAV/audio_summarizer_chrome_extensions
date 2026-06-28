class PCMProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];

    if (input && input[0] && input[0].length > 0) {
      // input[0] — Float32Array channel data
      // Copy the data to avoid issues with transferring the same buffer
      this.port.postMessage(input[0].slice());
    }

    // true → continue processing
    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
