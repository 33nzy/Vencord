/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Mp3Encoder } from "@breezystack/lamejs";

import { PcmFrame } from "./PcmRingBuffer";

const MP3_SAMPLE_BLOCK = 1152;

export function floatToInt16(input: Float32Array) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
        const sample = Math.max(-1, Math.min(1, input[i]));
        output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return output;
}

function mergeChannels(frames: PcmFrame[], channels: number) {
    const total = frames.reduce((sum, frame) => sum + frame.samples, 0);
    const left = new Int16Array(total);
    const right = channels === 2 ? new Int16Array(total) : null;

    let offset = 0;
    for (const frame of frames) {
        left.set(frame.left, offset);
        if (right) right.set(frame.right ?? frame.left, offset);
        offset += frame.samples;
    }

    return { left, right, total };
}

export function encodePcmToMp3(frames: PcmFrame[], sampleRate: number, kbps: number) {
    const channels = frames.some(frame => frame.right) ? 2 : 1;
    const { left, right } = mergeChannels(frames, channels);
    const encoder = new Mp3Encoder(channels, sampleRate, kbps);
    const parts: Uint8Array[] = [];

    for (let i = 0; i < left.length; i += MP3_SAMPLE_BLOCK) {
        const leftBlock = left.subarray(i, i + MP3_SAMPLE_BLOCK);
        const encoded = right
            ? encoder.encodeBuffer(leftBlock, right.subarray(i, i + MP3_SAMPLE_BLOCK))
            : encoder.encodeBuffer(leftBlock);
        if (encoded.length) parts.push(new Uint8Array(encoded));
    }

    const tail = encoder.flush();
    if (tail.length) parts.push(new Uint8Array(tail));

    return new Blob(parts as BlobPart[], { type: "audio/mpeg" });
}

function writeString(view: DataView, offset: number, value: string) {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

export function encodePcmToWav(frames: PcmFrame[], sampleRate: number) {
    const channels = frames.some(frame => frame.right) ? 2 : 1;
    const { left, right, total } = mergeChannels(frames, channels);
    const dataLength = total * channels * 2;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, dataLength, true);

    let offset = 44;
    for (let i = 0; i < total; i++) {
        view.setInt16(offset, left[i], true);
        offset += 2;
        if (right) {
            view.setInt16(offset, right[i], true);
            offset += 2;
        }
    }

    return new Blob([buffer], { type: "audio/wav" });
}
