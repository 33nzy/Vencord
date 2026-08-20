/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { makeRange, OptionType } from "@utils/types";

export type ReplayFormat = "mp3" | "wav";

function emitConfigure() {
    window.dispatchEvent(new CustomEvent("vc-voice-replay-settings-change"));
}

function emitRestart() {
    window.dispatchEvent(new CustomEvent("vc-voice-replay-restart"));
}

export const settings = definePluginSettings({
    replayDuration: {
        type: OptionType.SELECT,
        description: "Replay duration",
        options: [
            { label: "30 seconds", value: 30 },
            { label: "60 seconds", value: 60, default: true },
            { label: "2 minutes", value: 120 },
            { label: "5 minutes", value: 300 },
            { label: "Custom", value: 0 }
        ],
        onChange: emitConfigure
    },
    customReplayDuration: {
        type: OptionType.NUMBER,
        description: "Custom replay duration in seconds",
        default: 60,
        isValid(value) {
            const duration = Number(value);
            return duration >= 5 && duration <= 600 || "Use a duration between 5 and 600 seconds.";
        },
        onChange: emitConfigure
    },
    fileFormat: {
        type: OptionType.SELECT,
        description: "Replay file format",
        options: [
            { label: "MP3 (recommended)", value: "mp3", default: true },
            { label: "WAV (lossless, larger)", value: "wav" }
        ]
    },
    captureMode: {
        type: OptionType.SELECT,
        description: "How to capture the call audio",
        options: [
            { label: "System audio — always captures everyone (recommended)", value: "loopback", default: true },
            { label: "Discord window only — excludes other app sounds", value: "frame" }
        ],
        onChange: emitRestart
    },
    includeMicrophone: {
        type: OptionType.BOOLEAN,
        description: "Mix your microphone into the replay",
        default: true,
        onChange: emitRestart
    },
    separateStems: {
        type: OptionType.BOOLEAN,
        description: "Record the call and your mic on separate channels so you can mute either side during preview",
        default: false,
        onChange: emitRestart
    },
    stopMicWhenMuted: {
        type: OptionType.BOOLEAN,
        description: "Leave your mic out of the replay while you are muted or deafened in Discord. Turn off to always record your mic.",
        default: true
    },
    inputDeviceId: {
        type: OptionType.STRING,
        description: "Microphone input device id. Leave empty to use Discord's input device.",
        default: "",
        onChange: emitRestart
    },
    outputFolder: {
        type: OptionType.STRING,
        description: "Output folder. Leave empty to use your Music/VoiceReplay folder.",
        default: "",
        target: "DESKTOP"
    },
    hotkey: {
        type: OptionType.STRING,
        description: "Replay hotkey. Example: Alt+Shift+S",
        default: "Alt+Shift+S"
    },
    autoStartBuffering: {
        type: OptionType.BOOLEAN,
        description: "Start buffering automatically when joining voice",
        default: true
    },
    notifications: {
        type: OptionType.BOOLEAN,
        description: "Show toast notifications",
        default: true
    },
    soundEffect: {
        type: OptionType.BOOLEAN,
        description: "Play a small sound when a replay is saved",
        default: true
    },
    audioGain: {
        type: OptionType.SLIDER,
        description: "Replay volume boost",
        default: 1.25,
        markers: makeRange(1, 2.5, 0.25),
        stickToMarkers: true,
        onChange: emitConfigure
    },
    audioBitrateKbps: {
        type: OptionType.SLIDER,
        description: "Recording quality (kbps)",
        default: 192,
        markers: makeRange(96, 256, 32),
        stickToMarkers: true,
        onChange: emitRestart
    },
    maxRamMb: {
        type: OptionType.SLIDER,
        description: "Maximum approximate replay buffer memory (MB)",
        default: 96,
        markers: makeRange(16, 256, 16),
        stickToMarkers: true,
        onChange: emitConfigure
    },
    animatedButton: {
        type: OptionType.BOOLEAN,
        description: "Animate the voice controls replay button",
        default: true
    },
    timestampsInFilename: {
        type: OptionType.BOOLEAN,
        description: "Save timestamps in filenames",
        default: true
    }
});

export function getReplayDurationMs() {
    const preset = settings.store.replayDuration;
    const seconds = preset === 0 ? settings.store.customReplayDuration : preset;
    return Math.max(5, Math.min(600, Number(seconds) || 60)) * 1000;
}
