/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FluxDispatcher } from "@webpack/common";

import { SpeakingSegment } from "./ReplayHistory";

interface RawSegment {
    userId: string;
    start: number;
    end: number;
}

interface SpeakingEvent {
    userId: string;
    speakingFlags?: number;
    speaking?: number | boolean;
}

class SpeakingTracker {
    private segments: RawSegment[] = [];
    private active = new Map<string, number>();
    private running = false;
    private windowMs = 60_000;

    private handleSpeaking = (event: SpeakingEvent) => {
        const speaking = event.speakingFlags != null ? event.speakingFlags !== 0 : Boolean(event.speaking);
        const now = Date.now();

        if (speaking) {
            if (!this.active.has(event.userId)) this.active.set(event.userId, now);
        } else {
            const start = this.active.get(event.userId);
            if (start != null) {
                this.active.delete(event.userId);
                this.segments.push({ userId: event.userId, start, end: now });
                this.prune(now);
            }
        }
    };

    start(windowMs: number) {
        this.windowMs = windowMs;
        if (this.running) return;
        this.running = true;
        this.segments = [];
        this.active.clear();
        FluxDispatcher.subscribe("SPEAKING", this.handleSpeaking as any);
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        FluxDispatcher.unsubscribe("SPEAKING", this.handleSpeaking as any);
        this.segments = [];
        this.active.clear();
    }

    setWindow(windowMs: number) {
        this.windowMs = windowMs;
        this.prune(Date.now());
    }

    reset() {
        const now = Date.now();
        this.segments = [];
        for (const userId of this.active.keys()) this.active.set(userId, now);
    }

    snapshot(startTime: number, durationSeconds: number): SpeakingSegment[] {
        const audioEnd = startTime + durationSeconds * 1000;
        const raw: RawSegment[] = [...this.segments];
        for (const [userId, start] of this.active) raw.push({ userId, start, end: audioEnd });

        const result: SpeakingSegment[] = [];
        for (const segment of raw) {
            const clampedStart = Math.max(0, (segment.start - startTime) / 1000);
            const clampedEnd = Math.min(durationSeconds, (segment.end - startTime) / 1000);
            if (clampedEnd <= 0 || clampedStart >= durationSeconds || clampedEnd <= clampedStart) continue;
            result.push({ id: segment.userId, start: clampedStart, end: clampedEnd });
        }

        return result.sort((a, b) => a.start - b.start);
    }

    private prune(now: number) {
        const cutoff = now - this.windowMs - 5000;
        if (this.segments.length > 400 || (this.segments[0] && this.segments[0].end < cutoff)) {
            this.segments = this.segments.filter(segment => segment.end >= cutoff);
        }
    }
}

export const speakingTracker = new SpeakingTracker();
