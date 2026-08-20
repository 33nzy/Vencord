/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { PluginNative } from "@utils/types";
import { ChannelStore, FluxDispatcher, GuildStore, MediaEngineStore, SelectedChannelStore, Toasts, UserStore, VoiceStateStore } from "@webpack/common";

import { getReplayDurationMs, settings } from "../settings";
import { encodePcmToMp3, encodePcmToWav, floatToInt16 } from "./AudioEncoder";
import { getDiscordLocalAudioTracks, getDiscordRemoteAudioTracks, onAudioTracksChanged, startDiscordAudioTap } from "./DiscordAudioTap";
import { notify, playSaveSound } from "./NotificationManager";
import { PcmRingBuffer } from "./PcmRingBuffer";
import { addReplayHistoryEntry, ReplayParticipant } from "./ReplayHistory";
import { speakingTracker } from "./SpeakingTracker";

const logger = new Logger("VoiceReplay");
const MIN_SAVEABLE_REPLAY_SECONDS = 0.5;
const PROCESSOR_BUFFER_SIZE = 4096;
const WORKLET_NAME = "vc-voice-replay-recorder";
const WORKLET_CODE = `
class Recorder extends AudioWorkletProcessor {
    constructor() {
        super();
        this.size = 4096;
        this.left = new Float32Array(this.size);
        this.right = new Float32Array(this.size);
        this.pos = 0;
    }
    process(inputs) {
        const input = inputs[0];
        if (!input || !input.length) return true;
        const l = input[0];
        const r = input[1] || input[0];
        for (let i = 0; i < l.length; i++) {
            this.left[this.pos] = l[i];
            this.right[this.pos] = r[i];
            if (++this.pos >= this.size) {
                this.port.postMessage({ left: this.left, right: this.right }, [this.left.buffer, this.right.buffer]);
                this.left = new Float32Array(this.size);
                this.right = new Float32Array(this.size);
                this.pos = 0;
            }
        }
        return true;
    }
}
registerProcessor(${JSON.stringify(WORKLET_NAME)}, Recorder);
`;

let workletUrl: string | undefined;
function getWorkletUrl() {
    if (!workletUrl) workletUrl = URL.createObjectURL(new Blob([WORKLET_CODE], { type: "application/javascript" }));
    return workletUrl;
}

function getNative() {
    return IS_WEB
        ? null
        : VencordNative.pluginHelpers?.VoiceReplay as PluginNative<typeof import("../native")> | undefined;
}

function sleep(ms: number) {
    return new Promise<void>(resolve => window.setTimeout(resolve, ms));
}

export type ReplayState = "idle" | "buffering" | "saving" | "error" | "disabled";

export interface ReplaySnapshot {
    state: ReplayState;
    error?: string;
    seconds: number;
    bytes: number;
    chunks: number;
    callTracks: number;
    hasMic: boolean;
}

type Listener = (snapshot: ReplaySnapshot) => void;

interface AttachedTrack {
    source: MediaStreamAudioSourceNode;
    track: MediaStreamTrack;
    sink?: HTMLAudioElement;
    owned: boolean;
    isCall: boolean;
}

function formatCaptureError(err: unknown) {
    if (!(err instanceof DOMException)) return err instanceof Error ? err.message : String(err);

    switch (err.name) {
        case "NotAllowedError":
        case "SecurityError":
            return "Audio capture was denied. Join a voice call, then start VoiceReplay again.";
        case "NotFoundError":
            return "No matching audio input was found. Check Discord's input device and your system audio devices.";
        case "NotReadableError":
            return "The audio device is busy or unavailable. Try rejoining voice or selecting another input device.";
        default:
            return err.message || err.name;
    }
}

function isPermissionDeniedError(err: unknown) {
    const name = err instanceof DOMException
        ? err.name
        : typeof err === "object" && err && "name" in err ? String((err as any).name) : "";

    return name === "NotAllowedError" || name === "SecurityError";
}

class VoiceReplayManager {
    private buffer = new PcmRingBuffer(60_000, 96 * 1024 * 1024);
    private listeners = new Set<Listener>();
    private attached = new Map<string, AttachedTrack>();
    private context?: AudioContext;
    private gainNode?: GainNode;
    private callGain?: GainNode;
    private micGain?: GainNode;
    private captureNode?: AudioNode;
    private silentGain?: GainNode;
    private stemMode = false;
    private micStream?: MediaStream;
    private hasOwnMic = false;
    private callCaptureActive = false;
    private callRecapturePending = false;
    private callAnalyser?: AnalyserNode;
    private micAnalyser?: AnalyserNode;
    private micRecapturePending = false;
    private healthTimer?: number;
    private selfId?: string;
    private lastRemoteSpeakingAt = 0;
    private lastCallSignalAt = 0;
    private lastSelfSpeakingAt = 0;
    private lastMicSignalAt = 0;
    private unsubscribeTap?: () => void;
    private lastEmit = 0;
    private state: ReplayState = "idle";
    private error?: string;

    subscribe(listener: Listener) {
        this.listeners.add(listener);
        listener(this.getSnapshot());
        return () => this.listeners.delete(listener);
    }

    getSnapshot(): ReplaySnapshot {
        let callTracks = 0;
        for (const entry of this.attached.values()) {
            if (entry.isCall) callTracks++;
        }

        return {
            state: this.state,
            error: this.error,
            ...this.buffer.getStats(),
            callTracks,
            hasMic: this.hasOwnMic || (this.attached.size - callTracks) > 0
        };
    }

    async start() {
        if (this.state === "buffering" || this.state === "saving") return;

        startDiscordAudioTap();

        if (!window.AudioContext) {
            this.setState("disabled", "Web Audio is not available in this Discord build.");
            return;
        }

        try {
            this.buffer.clear();
            this.hasOwnMic = false;
            this.callCaptureActive = false;

            this.context = new AudioContext();
            this.buffer.sampleRate = this.context.sampleRate;
            this.buffer.configure(getReplayDurationMs(), settings.store.maxRamMb * 1024 * 1024);

            this.gainNode = this.context.createGain();
            this.gainNode.gain.value = settings.store.audioGain;

            this.callGain = this.context.createGain();
            this.micGain = this.context.createGain();
            this.micGain.gain.value = 1;

            this.stemMode = settings.store.separateStems && settings.store.includeMicrophone;

            if (this.stemMode) {
                const merger = this.context.createChannelMerger(2);
                this.callGain.connect(merger, 0, 0);
                this.micGain.connect(merger, 0, 1);
                merger.connect(this.gainNode);
            } else {
                this.callGain.connect(this.gainNode);
                this.micGain.connect(this.gainNode);
            }

            this.callAnalyser = this.context.createAnalyser();
            this.callAnalyser.fftSize = 1024;
            this.callGain.connect(this.callAnalyser);

            this.micAnalyser = this.context.createAnalyser();
            this.micAnalyser.fftSize = 1024;
            this.micGain.connect(this.micAnalyser);

            this.captureNode = this.createScriptProcessorNode();

            this.silentGain = this.context.createGain();
            this.silentGain.gain.value = 0;

            this.gainNode.connect(this.captureNode);
            this.captureNode.connect(this.silentGain);
            this.silentGain.connect(this.context.destination);
            void this.context.resume();

            await this.attachCallAudio();
            if (settings.store.includeMicrophone) await this.attachMicrophone();
            this.updateMicMute();

            speakingTracker.start(getReplayDurationMs());
            this.unsubscribeTap = onAudioTracksChanged(() => this.syncTracks());
            FluxDispatcher.subscribe("AUDIO_TOGGLE_SELF_MUTE", this.handleMuteChange);
            FluxDispatcher.subscribe("AUDIO_TOGGLE_SELF_DEAF", this.handleMuteChange);
            this.startCallHealthMonitor();
            this.setState("buffering");
            this.syncTracks();
            void this.tryUpgradeToWorklet();
        } catch (err) {
            this.teardown();
            const message = formatCaptureError(err);
            this.setState("error", message);
            notify(`VoiceReplay could not start: ${message}`, Toasts.Type.FAILURE);
        }
    }

    stop() {
        if (this.state === "idle") return;
        this.teardown();
        this.buffer.clear();
        this.setState("idle");
    }

    restart() {
        if (this.state !== "buffering") return;
        this.stop();
        void this.start();
    }

    configure() {
        this.buffer.configure(getReplayDurationMs(), settings.store.maxRamMb * 1024 * 1024);
        if (this.gainNode) this.gainNode.gain.value = settings.store.audioGain;
        speakingTracker.setWindow(getReplayDurationMs());
        this.emit();
    }

    syncTracks() {
        if (!this.context || this.state !== "buffering" || this.callCaptureActive) return;
        this.attachWebCallTracks();
    }

    async saveReplay() {
        if (this.state === "saving") return;

        if (!this.buffer.hasAudio()) {
            notify("VoiceReplay has no buffered audio yet. Wait a couple seconds, then try again.", Toasts.Type.FAILURE);
            return;
        }

        const previousState = this.state;
        this.setState("saving");

        try {
            const startTime = this.buffer.getStartTime();
            const { blob, extension, duration } = this.createOutputBlob();

            if (duration < MIN_SAVEABLE_REPLAY_SECONDS) {
                throw new Error(`VoiceReplay captured only ${duration.toFixed(1)}s of audio. Wait a couple seconds, then save again.`);
            }

            const timeline = speakingTracker.snapshot(startTime, duration);
            const participants = this.getCurrentParticipants();
            const filename = this.createFilename(extension);
            const Native = getNative();

            let filePath = filename;
            if (typeof Native?.saveReplay !== "function") {
                this.downloadInBrowser(blob, filename);
            } else {
                const bytes = new Uint8Array(await blob.arrayBuffer());
                filePath = await Native.saveReplay(bytes, filename, settings.store.outputFolder || void 0);
                playSaveSound();
                notify(`Saved replay to ${filePath}`, Toasts.Type.SUCCESS);
            }

            this.addHistory(filePath, blob, extension, duration, participants, timeline, this.stemMode);
            window.dispatchEvent(new CustomEvent("vc-voice-replay-saved", {
                detail: {
                    filePath,
                    filename: filePath.split(/[\\/]/).pop() ?? filename,
                    durationSeconds: duration,
                    bytes: blob.size,
                    format: extension,
                    participants
                }
            }));

            if (previousState === "buffering") {
                this.buffer.clear();
                speakingTracker.reset();
                this.setState("buffering");
            } else {
                this.setState("idle");
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.setState(previousState === "buffering" ? "buffering" : "error", message);
            notify(`Failed to save VoiceReplay: ${message}`, Toasts.Type.FAILURE);
        }
    }

    private handleSpeaking = (event: { userId?: string; speakingFlags?: number; speaking?: number | boolean; }) => {
        const speaking = event.speakingFlags != null ? event.speakingFlags !== 0 : Boolean(event.speaking);
        if (!speaking || !event.userId) return;
        if (event.userId === this.selfId) this.lastSelfSpeakingAt = Date.now();
        else this.lastRemoteSpeakingAt = Date.now();
    };

    private startCallHealthMonitor() {
        window.clearInterval(this.healthTimer);
        this.selfId = UserStore.getCurrentUser?.()?.id;
        this.lastRemoteSpeakingAt = 0;
        this.lastSelfSpeakingAt = 0;
        this.lastCallSignalAt = Date.now();
        this.lastMicSignalAt = Date.now();
        FluxDispatcher.subscribe("SPEAKING", this.handleSpeaking as any);

        this.healthTimer = window.setInterval(() => this.checkAudioHealth(), 1000);
    }

    private analyserPeak(analyser: AnalyserNode) {
        const data = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
        return peak;
    }

    private checkAudioHealth() {
        if (this.state !== "buffering") return;
        const now = Date.now();

        if (this.callAnalyser && !this.callRecapturePending) {
            if (this.analyserPeak(this.callAnalyser) > 0.004) this.lastCallSignalAt = now;
            const someoneTalked = now - this.lastRemoteSpeakingAt < 3000;
            const callSilent = now - this.lastCallSignalAt > 3000;
            if (this.callCaptureActive && someoneTalked && callSilent) {
                logger.warn("Others are talking but no call audio is captured; re-grabbing call capture.");
                void this.forceRecaptureCall();
            }
        }

        if (this.micAnalyser && !this.micRecapturePending && settings.store.includeMicrophone) {
            if (this.analyserPeak(this.micAnalyser) > 0.004) this.lastMicSignalAt = now;
            const iTalked = now - this.lastSelfSpeakingAt < 3000;
            const micSilent = now - this.lastMicSignalAt > 3000;
            const notMuted = !(settings.store.stopMicWhenMuted && (MediaEngineStore.isSelfMute?.() || MediaEngineStore.isSelfDeaf?.()));
            if (this.hasOwnMic && notMuted && iTalked && micSilent) {
                logger.warn("You are talking but no mic audio is captured; re-grabbing microphone.");
                void this.forceRecaptureMic();
            }
        }
    }

    private async forceRecaptureCall() {
        if (this.callRecapturePending || this.state !== "buffering") return;
        this.callRecapturePending = true;

        for (const [id, entry] of [...this.attached]) {
            if (!entry.isCall) continue;
            this.attached.delete(id);
            try {
                entry.source.disconnect();
            } catch { }
            if (entry.sink) {
                entry.sink.pause();
                entry.sink.srcObject = null;
            }
            if (entry.owned) entry.track.stop();
        }

        this.callCaptureActive = false;
        await this.attachCallAudio();

        this.callRecapturePending = false;
        this.lastCallSignalAt = Date.now();
        this.lastRemoteSpeakingAt = 0;
    }

    private async forceRecaptureMic() {
        if (this.micRecapturePending || this.state !== "buffering") return;
        this.micRecapturePending = true;

        for (const [id, entry] of [...this.attached]) {
            if (entry.isCall) continue;
            this.attached.delete(id);
            try {
                entry.source.disconnect();
            } catch { }
            if (entry.owned) entry.track.stop();
        }
        this.micStream?.getTracks().forEach(track => track.stop());
        this.micStream = void 0;
        this.hasOwnMic = false;

        try {
            this.micStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                video: false
            });
            for (const track of this.micStream.getAudioTracks()) this.attachTrack(track, { owned: true, isCall: false });
            this.hasOwnMic = true;
            this.updateMicMute();
            logger.info("Re-captured microphone on the default device.");
        } catch (err) {
            logger.warn("Microphone re-capture failed.", err);
            for (const track of getDiscordLocalAudioTracks()) this.attachTrack(track, { owned: false, isCall: false });
        }

        this.micRecapturePending = false;
        this.lastMicSignalAt = Date.now();
        this.lastSelfSpeakingAt = 0;
    }

    private handleMuteChange = () => this.updateMicMute();

    private updateMicMute() {
        if (!this.micGain) return;
        const muted = settings.store.stopMicWhenMuted && Boolean(MediaEngineStore.isSelfMute?.() || MediaEngineStore.isSelfDeaf?.());
        this.micGain.gain.value = muted ? 0 : 1;
    }

    private createScriptProcessorNode() {
        const node = this.context!.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 2, 2);
        node.onaudioprocess = event => this.captureFrame(event.inputBuffer);
        return node;
    }

    private async tryUpgradeToWorklet() {
        const ctx = this.context;
        if (!ctx?.audioWorklet) return;

        try {
            await Promise.race([
                ctx.audioWorklet.addModule(getWorkletUrl()),
                new Promise((_, reject) => window.setTimeout(() => reject(new Error("AudioWorklet load timed out.")), 1500))
            ]);
        } catch (err) {
            logger.warn("AudioWorklet unavailable; staying on ScriptProcessor.", err);
            return;
        }

        if (this.context !== ctx || this.state !== "buffering" || !this.gainNode || !this.silentGain) return;
        if (this.captureNode instanceof AudioWorkletNode) return;

        try {
            const node = new AudioWorkletNode(ctx, WORKLET_NAME, {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [2]
            });
            node.port.onmessage = event => {
                const { left, right } = event.data as { left: Float32Array; right: Float32Array; };
                this.buffer.push(floatToInt16(left), floatToInt16(right));
                this.throttledEmit();
            };

            const old = this.captureNode;
            this.gainNode.disconnect();
            if (old) {
                (old as ScriptProcessorNode).onaudioprocess = null;
                try {
                    old.disconnect();
                } catch { }
            }
            this.gainNode.connect(node);
            node.connect(this.silentGain);
            this.captureNode = node;
            logger.info("Upgraded recording to AudioWorklet.");
        } catch (err) {
            logger.warn("Failed to upgrade to AudioWorklet.", err);
        }
    }

    private captureFrame(input: AudioBuffer) {
        const left = floatToInt16(input.getChannelData(0));
        const right = input.numberOfChannels > 1 ? floatToInt16(input.getChannelData(1)) : null;
        this.buffer.push(left, right);
        this.throttledEmit();
    }

    private throttledEmit() {
        const now = Date.now();
        if (now - this.lastEmit >= 250) {
            this.lastEmit = now;
            this.emit();
        }
    }

    private async attachCallAudio() {
        const Native = getNative();

        if (Native) {
            const mode = settings.store.captureMode === "loopback" ? "systemLoopback" : "discordFrame";

            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    const stream = await this.captureNativeAudio(Native, mode);
                    for (const track of stream.getAudioTracks()) this.attachTrack(track, { owned: true, isCall: true });
                    this.callCaptureActive = true;
                    logger.info(`Capturing call audio via Electron (${mode}).`);
                    return;
                } catch (err) {
                    if (isPermissionDeniedError(err)) break;
                    logger.warn(`Electron ${mode} capture attempt ${attempt} failed.`, err);
                    if (attempt < 3) await sleep(350);
                }
            }
        }

        this.attachWebCallTracks();
    }

    private async captureNativeAudio(Native: NonNullable<ReturnType<typeof getNative>>, mode: "discordFrame" | "systemLoopback") {
        const installed = await Native.installOutputAudioCaptureHandler?.(mode);
        if (!installed) throw new Error("Electron capture handler is unavailable.");

        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true } as any);
            stream.getVideoTracks().forEach(track => track.stop());
            const audioTracks = stream.getAudioTracks().filter(track => track.readyState === "live");
            if (!audioTracks.length) {
                stream.getTracks().forEach(track => track.stop());
                throw new Error("Electron capture returned no live audio.");
            }
            return new MediaStream(audioTracks);
        } finally {
            await Native.clearOutputAudioCaptureHandler?.();
        }
    }

    private recaptureCallAudio() {
        if (this.state !== "buffering" || this.callRecapturePending) return;

        const hasCallTrack = [...this.attached.values()].some(entry => entry.isCall && entry.owned);
        if (hasCallTrack) return;

        this.callRecapturePending = true;
        this.callCaptureActive = false;
        window.setTimeout(async () => {
            this.callRecapturePending = false;
            if (this.state !== "buffering") return;
            logger.info("Call audio dropped; re-capturing.");
            await this.attachCallAudio();
        }, 500);
    }

    private attachWebCallTracks() {
        for (const track of getDiscordRemoteAudioTracks()) {
            if (track.readyState === "live") this.attachTrack(track, { owned: false, isCall: true });
        }

        for (const element of document.querySelectorAll<HTMLMediaElement>("audio, video")) {
            if (!element.isConnected || element.closest(".vc-voice-replay-library")) continue;
            if (element.muted || element.volume <= 0) continue;

            const source = element.srcObject;
            if (!(source instanceof MediaStream)) continue;
            for (const track of source.getAudioTracks()) {
                if (track.readyState === "live") this.attachTrack(track, { owned: false, isCall: true });
            }
        }

        if (settings.store.includeMicrophone && !this.hasOwnMic) {
            for (const track of getDiscordLocalAudioTracks()) this.attachTrack(track, { owned: false, isCall: false });
        }
    }

    private async attachMicrophone() {
        try {
            this.micStream = await this.requestMicrophoneStream();
            for (const track of this.micStream.getAudioTracks()) this.attachTrack(track, { owned: true, isCall: false });
            this.hasOwnMic = true;
            logger.info("Capturing local microphone audio.");
        } catch (err) {
            if (isPermissionDeniedError(err)) logger.warn("Microphone permission denied; using Discord's mic track instead.", err);
            else logger.warn("Microphone capture failed; using Discord's mic track instead.", err);

            for (const track of getDiscordLocalAudioTracks()) this.attachTrack(track, { owned: false, isCall: false });
        }
    }

    private async requestMicrophoneStream() {
        const selectedDeviceId = String(settings.store.inputDeviceId ?? "").trim();
        const discordDeviceId = MediaEngineStore.getInputDeviceId?.();
        const deviceId = selectedDeviceId || (discordDeviceId && discordDeviceId !== "default" ? discordDeviceId : "");
        const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
        const attempts: MediaTrackConstraints[] = deviceId
            ? [{ ...base, deviceId: { exact: deviceId } }, { ...base, deviceId: { ideal: deviceId } }, base]
            : [base];

        let lastError: unknown;
        for (const audio of attempts) {
            try {
                return await navigator.mediaDevices.getUserMedia({ audio, video: false });
            } catch (err) {
                lastError = err;
                if (isPermissionDeniedError(err)) throw err;
            }
        }

        throw lastError ?? new Error("Could not capture microphone input.");
    }

    private attachTrack(track: MediaStreamTrack, options: { owned: boolean; isCall: boolean; }) {
        if (!this.context || !this.gainNode || this.attached.has(track.id)) return;
        if (track.kind !== "audio" || track.readyState !== "live") return;

        const stream = new MediaStream([track]);
        const source = this.context.createMediaStreamSource(stream);
        const target = options.isCall ? this.callGain : this.micGain;
        source.connect(target ?? this.gainNode);

        let sink: HTMLAudioElement | undefined;
        if (options.isCall && !options.owned) {
            sink = new Audio();
            sink.muted = true;
            sink.srcObject = stream;
            void sink.play().catch(() => void 0);
        }

        this.attached.set(track.id, { source, track, sink, owned: options.owned, isCall: options.isCall });
        track.addEventListener("ended", () => this.detachTrack(track.id, true), { once: true });
        this.emit();
    }

    private detachTrack(id: string, ended = false) {
        const entry = this.attached.get(id);
        if (!entry) return;

        this.attached.delete(id);
        try {
            entry.source.disconnect();
        } catch { }
        if (ended && entry.isCall && entry.owned) this.recaptureCallAudio();
        if (entry.sink) {
            entry.sink.pause();
            entry.sink.srcObject = null;
        }
        if (entry.owned) entry.track.stop();
        this.emit();
    }

    private teardown() {
        this.unsubscribeTap?.();
        this.unsubscribeTap = void 0;
        speakingTracker.stop();
        FluxDispatcher.unsubscribe("AUDIO_TOGGLE_SELF_MUTE", this.handleMuteChange);
        FluxDispatcher.unsubscribe("AUDIO_TOGGLE_SELF_DEAF", this.handleMuteChange);
        FluxDispatcher.unsubscribe("SPEAKING", this.handleSpeaking as any);
        window.clearInterval(this.healthTimer);
        this.healthTimer = void 0;
        this.callAnalyser = void 0;
        this.micAnalyser = void 0;

        for (const id of [...this.attached.keys()]) this.detachTrack(id);
        this.micStream?.getTracks().forEach(track => track.stop());
        this.micStream = void 0;
        this.hasOwnMic = false;
        this.callCaptureActive = false;
        this.callRecapturePending = false;
        this.micRecapturePending = false;

        if (this.captureNode) {
            if (this.captureNode instanceof AudioWorkletNode) this.captureNode.port.onmessage = null;
            else (this.captureNode as ScriptProcessorNode).onaudioprocess = null;
            try {
                this.captureNode.disconnect();
            } catch { }
        }
        this.captureNode = void 0;
        try {
            this.silentGain?.disconnect();
            this.micGain?.disconnect();
            this.callGain?.disconnect();
            this.gainNode?.disconnect();
        } catch { }
        this.silentGain = void 0;
        this.micGain = void 0;
        this.callGain = void 0;
        this.gainNode = void 0;

        void this.context?.close();
        this.context = void 0;
    }

    private createOutputBlob() {
        const frames = this.buffer.getFrames();
        const { sampleRate } = this.buffer;
        const duration = this.buffer.getStats().seconds;

        if (settings.store.fileFormat === "wav") {
            return { blob: encodePcmToWav(frames, sampleRate), extension: "wav", duration };
        }

        return {
            blob: encodePcmToMp3(frames, sampleRate, settings.store.audioBitrateKbps),
            extension: "mp3",
            duration
        };
    }

    private createFilename(extension: string) {
        if (!settings.store.timestampsInFilename) return `voice-replay.${extension}`;
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        return `voice-replay-${stamp}.${extension}`;
    }

    private getGuildIconUrl(guild: any) {
        if (!guild?.id || !guild.icon) return void 0;
        const animated = String(guild.icon).startsWith("a_");
        return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${animated ? "gif" : "png"}?size=96`;
    }

    private getCurrentParticipants(): ReplayParticipant[] {
        const voiceChannelId = SelectedChannelStore.getVoiceChannelId();
        if (!voiceChannelId) return [];

        const channel = ChannelStore.getChannel(voiceChannelId);
        const guildId = channel?.guild_id;
        const selfId = UserStore.getCurrentUser?.()?.id;
        const states = VoiceStateStore.getVoiceStatesForChannel?.(voiceChannelId) ?? {};

        return Object.values(states)
            .map((state: any) => UserStore.getUser(state.userId))
            .filter(Boolean)
            .map((user: any) => ({
                id: user.id,
                name: user.globalName || user.username || user.tag || user.id,
                avatarUrl: user.getAvatarURL?.(guildId, 64, true),
                self: user.id === selfId
            }));
    }

    private addHistory(
        filePath: string,
        blob: Blob,
        extension: string,
        durationSeconds: number,
        participants: ReplayParticipant[],
        speakingTimeline: ReturnType<typeof speakingTracker.snapshot>,
        stems: boolean
    ) {
        const voiceChannelId = SelectedChannelStore.getVoiceChannelId();
        const channel = voiceChannelId ? ChannelStore.getChannel(voiceChannelId) : null;
        const guild = channel?.guild_id ? GuildStore.getGuild?.(channel.guild_id) : null;

        addReplayHistoryEntry({
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            filePath,
            filename: filePath.split(/[\\/]/).pop() ?? this.createFilename(extension),
            savedAt: Date.now(),
            durationSeconds,
            bytes: blob.size,
            format: extension,
            mimeType: blob.type,
            source: "call",
            bitrateKbps: settings.store.audioBitrateKbps,
            gain: settings.store.audioGain,
            channelName: channel?.name,
            guildName: guild?.name,
            guildIconUrl: this.getGuildIconUrl(guild),
            participants,
            speakingTimeline,
            stems
        });
    }

    private downloadInBrowser(blob: Blob, filename: string) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
        playSaveSound();
        notify("VoiceReplay saved through browser download.", Toasts.Type.SUCCESS);
    }

    private setState(state: ReplayState, error?: string) {
        this.state = state;
        this.error = error;
        this.emit();
    }

    private emit() {
        const snapshot = this.getSnapshot();
        for (const listener of this.listeners) listener(snapshot);
    }
}

export const replayManager = new VoiceReplayManager();
