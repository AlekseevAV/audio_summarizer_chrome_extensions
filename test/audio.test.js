import { test } from "node:test";
import assert from "node:assert/strict";
import {
  floatTo16BitPCM,
  arrayBufferToBase64,
} from "../chrome-extension/offscreen/audio.js";

test("floatTo16BitPCM maps the full-scale range", () => {
  const out = floatTo16BitPCM(new Float32Array([0, 1, -1, 0.5, -0.5]));
  assert.ok(out instanceof Int16Array);
  assert.equal(out[0], 0);
  assert.equal(out[1], 32767); // +1.0 -> max positive
  assert.equal(out[2], -32768); // -1.0 -> min negative
  assert.equal(out[3], 16383); // 0.5 * 32767 = 16383.5, truncated toward zero
  assert.equal(out[4], -16384); // -0.5 * 0x8000
});

test("floatTo16BitPCM clamps out-of-range input", () => {
  const out = floatTo16BitPCM(new Float32Array([2, -2, 1.5, -3]));
  assert.equal(out[0], 32767);
  assert.equal(out[1], -32768);
  assert.equal(out[2], 32767);
  assert.equal(out[3], -32768);
});

test("floatTo16BitPCM preserves length", () => {
  const out = floatTo16BitPCM(new Float32Array(128));
  assert.equal(out.length, 128);
});

test("arrayBufferToBase64 round-trips through atob", () => {
  const bytes = Uint8Array.from([0, 1, 2, 254, 255, 65, 66, 67]);
  const base64 = arrayBufferToBase64(bytes.buffer);

  // Decode back and compare.
  const decoded = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  assert.deepEqual([...decoded], [...bytes]);
});

test("arrayBufferToBase64 of empty buffer is empty string", () => {
  assert.equal(arrayBufferToBase64(new ArrayBuffer(0)), "");
});

test("PCM conversion + base64 produces decodable little-endian samples", () => {
  const pcm = floatTo16BitPCM(new Float32Array([1, -1]));
  const base64 = arrayBufferToBase64(pcm.buffer);
  const decoded = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  // 32767 = 0x7FFF little-endian -> [0xFF, 0x7F]; -32768 = 0x8000 -> [0x00, 0x80]
  assert.deepEqual([...decoded], [0xff, 0x7f, 0x00, 0x80]);
});
