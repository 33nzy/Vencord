/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface PcmFrame {
    left: Int16Array;
    right: Int16Array | null;
    samples: number;
    timestamp: number;
}

export class PcmRingBuffer {
    private frames: PcmFrame[] = [];
    private durationMs: number;
    private maxBytes: number;
    sampleRate = 48000;

    constructor(durationMs: number, maxBytes: number) {
        this.durationMs = durationMs;
        this.maxBytes = maxBytes;
    }

    configure(durationMs: number, maxBytes: number) {
        this.durationMs = durationMs;
        this.maxBytes = maxBytes;
        this.prune();
    }

    push(left: Int16Array, right: Int16Array | null) {
        if (!left.length) return;
        this.frames.push({ left, right, samples: left.length, timestamp: Date.now() });
        this.prune();
    }

    clear() {
        this.frames = [];
    }

    getFrames() {
        return [...this.frames];
    }

    getStartTime() {
        const first = this.frames[0];
        if (!first) return Date.now();
        return first.timestamp - (first.samples / this.sampleRate) * 1000;
    }

    private totalSamples() {
        let total = 0;
        for (const frame of this.frames) total += frame.samples;
        return total;
    }

    private channels() {
        return this.frames.some(frame => frame.right) ? 2 : 1;
    }

    getStats() {
        const samples = this.totalSamples();
        return {
            chunks: this.frames.length,
            bytes: samples * this.channels() * 2,
            seconds: samples / this.sampleRate
        };
    }

    hasAudio() {
        return this.totalSamples() >= this.sampleRate * 0.25;
    }

    private prune() {
        const maxSamples = Math.ceil(this.durationMs / 1000 * this.sampleRate);
        const maxSamplesByBytes = Math.floor(this.maxBytes / (this.channels() * 2));
        const limit = Math.min(maxSamples, maxSamplesByBytes || maxSamples);

        let total = this.totalSamples();
        while (this.frames.length > 1 && total - this.frames[0].samples >= limit) {
            total -= this.frames.shift()!.samples;
        }
    }
}
