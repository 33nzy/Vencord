/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { localStorage } from "@utils/localStorage";

const STORAGE_KEY = "VoiceReplay.savedReplays.v2";
const MAX_HISTORY = 80;

export interface ReplayParticipant {
    id: string;
    name: string;
    avatarUrl?: string;
    self?: boolean;
}

export interface SpeakingSegment {
    id: string;
    start: number;
    end: number;
}

export interface ReplayHistoryEntry {
    id: string;
    filePath: string;
    filename: string;
    savedAt: number;
    durationSeconds: number;
    bytes: number;
    format: string;
    mimeType: string;
    source: string;
    bitrateKbps: number;
    gain: number;
    channelName?: string;
    guildName?: string;
    guildIconUrl?: string;
    participants: ReplayParticipant[];
    speakingTimeline?: SpeakingSegment[];
    stems?: boolean;
}

function readHistory() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as ReplayHistoryEntry[];
    } catch {
        return [];
    }
}

function writeHistory(entries: ReplayHistoryEntry[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
    window.dispatchEvent(new CustomEvent("vc-voice-replay-history-change"));
}

export function getReplayHistory() {
    return readHistory();
}

export function addReplayHistoryEntry(entry: ReplayHistoryEntry) {
    const entries = readHistory().filter(item => item.filePath !== entry.filePath);
    writeHistory([entry, ...entries]);
}

export function removeReplayHistoryEntry(filePath: string) {
    writeHistory(readHistory().filter(item => item.filePath !== filePath));
}
