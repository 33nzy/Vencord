/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";

const logger = new Logger("VoiceReplayAudioTap");

type PeerConnectionConstructor = typeof RTCPeerConnection;

let originalPeerConnection: PeerConnectionConstructor | undefined;
let originalWebkitPeerConnection: PeerConnectionConstructor | undefined;
let installed = false;
let pollingInterval: number | undefined;

const peerConnections = new Set<RTCPeerConnection>();
const remoteAudioTracks = new Map<string, MediaStreamTrack>();
const localAudioTracks = new Map<string, MediaStreamTrack>();
const changeListeners = new Set<() => void>();

function emitChange() {
    for (const listener of changeListeners) {
        try {
            listener();
        } catch (err) {
            logger.warn("Audio tap listener failed.", err);
        }
    }
}

export function onAudioTracksChanged(listener: () => void) {
    changeListeners.add(listener);
    return () => void changeListeners.delete(listener);
}

function rememberTrack(track: MediaStreamTrack, map: Map<string, MediaStreamTrack>) {
    if (track.kind !== "audio" || track.readyState !== "live" || map.has(track.id)) return;

    map.set(track.id, track);
    track.addEventListener("ended", () => {
        map.delete(track.id);
        emitChange();
    }, { once: true });
    emitChange();
}

function scanPeerConnection(peerConnection: RTCPeerConnection) {
    try {
        for (const receiver of peerConnection.getReceivers?.() ?? []) {
            if (receiver.track && receiver.track.kind === "audio") {
                rememberTrack(receiver.track, remoteAudioTracks);
            }
        }

        for (const sender of peerConnection.getSenders?.() ?? []) {
            if (sender.track && sender.track.kind === "audio") {
                rememberTrack(sender.track, localAudioTracks);
            }
        }
    } catch (err) {
        logger.warn("Could not scan WebRTC audio tracks.", err);
    }
}

function rememberPeerConnection(peerConnection: RTCPeerConnection) {
    peerConnections.add(peerConnection);

    peerConnection.addEventListener("track", event => {
        rememberTrack(event.track, remoteAudioTracks);
        for (const stream of event.streams) {
            for (const track of stream.getAudioTracks()) {
                rememberTrack(track, remoteAudioTracks);
            }
        }
        scanPeerConnection(peerConnection);
    });

    peerConnection.addEventListener("connectionstatechange", () => {
        if (["closed", "failed", "disconnected"].includes(peerConnection.connectionState)) {
            peerConnections.delete(peerConnection);
        } else {
            scanPeerConnection(peerConnection);
        }
    });

    window.setTimeout(() => scanPeerConnection(peerConnection), 0);
}

function makePatchedPeerConnection(NativePeerConnection: PeerConnectionConstructor) {
    const PatchedPeerConnection = function (...args: ConstructorParameters<PeerConnectionConstructor>) {
        const peerConnection = new NativePeerConnection(...args);
        rememberPeerConnection(peerConnection);
        return peerConnection;
    } as unknown as PeerConnectionConstructor;

    Object.setPrototypeOf(PatchedPeerConnection, NativePeerConnection);
    PatchedPeerConnection.prototype = NativePeerConnection.prototype;

    return PatchedPeerConnection;
}

export function startDiscordAudioTap() {
    if (installed || typeof window.RTCPeerConnection !== "function") return;

    originalPeerConnection = window.RTCPeerConnection;
    window.RTCPeerConnection = makePatchedPeerConnection(originalPeerConnection);

    if (typeof (window as any).webkitRTCPeerConnection === "function") {
        originalWebkitPeerConnection = (window as any).webkitRTCPeerConnection;
        (window as any).webkitRTCPeerConnection = makePatchedPeerConnection(originalWebkitPeerConnection!);
    }

    installed = true;

    // فحص دوري مستمر لضمان لقط قنوات أصحابك حتى لو تداخلت إضافات أخرى
    pollingInterval = window.setInterval(() => {
        if (!installed) return;
        for (const pc of peerConnections) {
            scanPeerConnection(pc);
        }
    }, 2000);
}

export function forceRefreshTracks() {
    for (const peerConnection of peerConnections) {
        scanPeerConnection(peerConnection);
    }
    emitChange();
}

export function stopDiscordAudioTap() {
    if (!installed) return;

    if (pollingInterval) {
        window.clearInterval(pollingInterval);
        pollingInterval = undefined;
    }

    if (originalPeerConnection) window.RTCPeerConnection = originalPeerConnection;
    if (originalWebkitPeerConnection) (window as any).webkitRTCPeerConnection = originalWebkitPeerConnection;

    installed = false;
    originalPeerConnection = void 0;
    originalWebkitPeerConnection = void 0;
    peerConnections.clear();
    remoteAudioTracks.clear();
    localAudioTracks.clear();
    changeListeners.clear();
}

export function getDiscordRemoteAudioTracks() {
    for (const peerConnection of peerConnections) scanPeerConnection(peerConnection);
    return [...remoteAudioTracks.values()].filter(track => track.readyState === "live");
}

export function getDiscordLocalAudioTracks() {
    for (const peerConnection of peerConnections) scanPeerConnection(peerConnection);
    return [...localAudioTracks.values()].filter(track => track.readyState === "live");
}