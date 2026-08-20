/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { openModal } from "@utils/modal";
import { PluginNative } from "@utils/types";
import { ChannelStore, DraftType, React, SelectedChannelStore, showToast, Toasts, UploadHandler, useEffect, useRef, useState } from "@webpack/common";

import { ReplayParticipant } from "../utils/ReplayHistory";
import { AttachIcon, CloseIcon, FolderIcon, LogsIcon, PauseIcon, PlayIcon } from "./icons";
import { ReplayLibraryModal } from "./ReplayLibraryModal";

interface SavedDetail {
    filePath: string;
    filename: string;
    durationSeconds: number;
    bytes: number;
    format: string;
    participants: ReplayParticipant[];
}

interface PopupItem extends SavedDetail {
    key: number;
    leaving?: boolean;
}

const DISMISS_MS = 6500;

function getNative() {
    return IS_WEB
        ? null
        : VencordNative.pluginHelpers?.VoiceReplay as PluginNative<typeof import("../native")> | undefined;
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(seconds: number) {
    const safe = Math.max(0, Math.round(seconds || 0));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function getInitials(name: string) {
    return name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "?";
}

async function attachReplay(item: SavedDetail) {
    const bytes = await getNative()?.readReplayFile?.(item.filePath);
    if (!bytes || !("byteLength" in bytes) || !bytes.byteLength) {
        showToast("Could not read that replay file.", Toasts.Type.FAILURE);
        return;
    }

    const channelId = SelectedChannelStore.getChannelId();
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) {
        showToast("Open a text channel first.", Toasts.Type.FAILURE);
        return;
    }

    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes as Uint8Array);
    const mime = item.format === "mp3" ? "audio/mpeg" : item.format === "wav" ? "audio/wav" : "audio/webm";
    const file = new File([copy.buffer], item.filename, { type: mime });
    UploadHandler.promptToUpload([file], channel, DraftType.ChannelMessage);
}

function PopupCard({ item, onClose }: { item: PopupItem; onClose(): void; }) {
    const [paused, setPaused] = useState(false);
    const [playing, setPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const urlRef = useRef<string | null>(null);

    useEffect(() => {
        if (paused || playing) return;
        const timeout = window.setTimeout(onClose, DISMISS_MS);
        return () => window.clearTimeout(timeout);
    }, [paused, playing]);

    useEffect(() => () => {
        audioRef.current?.pause();
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    }, []);

    async function togglePlay() {
        const existing = audioRef.current;
        if (existing) {
            if (existing.paused) void existing.play().catch(() => void 0);
            else existing.pause();
            return;
        }

        const bytes = await getNative()?.readReplayFile?.(item.filePath);
        if (!bytes || !("byteLength" in bytes) || !bytes.byteLength) {
            showToast("Could not read that replay file.", Toasts.Type.FAILURE);
            return;
        }

        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes as Uint8Array);
        const mime = item.format === "mp3" ? "audio/mpeg" : item.format === "wav" ? "audio/wav" : "audio/webm";
        const url = URL.createObjectURL(new Blob([copy.buffer], { type: mime }));
        urlRef.current = url;

        const audio = new Audio(url);
        audio.onplay = () => setPlaying(true);
        audio.onpause = () => setPlaying(false);
        audio.onended = () => setPlaying(false);
        audioRef.current = audio;
        void audio.play().catch(() => void 0);
    }

    return (
        <div
            className={`vc-voice-replay-popup${item.leaving ? " vc-voice-replay-popup-leaving" : ""}`}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            <button className="vc-voice-replay-popup-close" onClick={onClose} aria-label="Dismiss">
                <CloseIcon width={13} height={13} />
            </button>

            <div className="vc-voice-replay-popup-head">
                <button className="vc-voice-replay-popup-play" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
                    {playing ? <PauseIcon width={16} height={16} /> : <PlayIcon width={16} height={16} />}
                </button>
                <div className="vc-voice-replay-popup-head-text">
                    <strong>Replay saved</strong>
                    <span>{formatDuration(item.durationSeconds)} · {formatBytes(item.bytes)} · {item.format.toUpperCase()}</span>
                </div>
                {!!item.participants.length && (
                    <div className="vc-voice-replay-popup-people">
                        {item.participants.slice(0, 4).map(participant => (
                            <span className="vc-voice-replay-popup-avatar" key={participant.id} title={participant.name}>
                                {participant.avatarUrl ? <img src={participant.avatarUrl} alt="" /> : <b>{getInitials(participant.name)}</b>}
                            </span>
                        ))}
                        {item.participants.length > 4 && <span className="vc-voice-replay-popup-avatar vc-voice-replay-popup-avatar-more">+{item.participants.length - 4}</span>}
                    </div>
                )}
            </div>

            <div className="vc-voice-replay-popup-actions">
                <button onClick={() => { void attachReplay(item); onClose(); }}>
                    <AttachIcon width={14} height={14} /> Attach
                </button>
                <button onClick={() => getNative()?.showReplayInFolder?.(item.filePath)}>
                    <FolderIcon width={14} height={14} /> Folder
                </button>
                <button onClick={() => { openModal(props => <ReplayLibraryModal {...props} />); onClose(); }}>
                    <LogsIcon width={14} height={14} /> Library
                </button>
            </div>

            {!paused && <div className="vc-voice-replay-popup-timer" style={{ animationDuration: `${DISMISS_MS}ms` }} />}
        </div>
    );
}

export function SavePopupHost() {
    const [items, setItems] = useState<PopupItem[]>([]);

    useEffect(() => {
        let counter = 0;
        const onSaved = (event: Event) => {
            const { detail } = event as CustomEvent<SavedDetail>;
            if (!detail) return;
            const key = ++counter;
            setItems(current => [...current.slice(-2), { ...detail, key }]);
        };

        window.addEventListener("vc-voice-replay-saved", onSaved);
        return () => window.removeEventListener("vc-voice-replay-saved", onSaved);
    }, []);

    function dismiss(key: number) {
        setItems(current => current.map(item => item.key === key ? { ...item, leaving: true } : item));
        window.setTimeout(() => setItems(current => current.filter(item => item.key !== key)), 260);
    }

    if (!items.length) return null;

    return (
        <div className="vc-voice-replay-popup-host">
            {items.map(item => (
                <PopupCard key={item.key} item={item} onClose={() => dismiss(item.key)} />
            ))}
        </div>
    );
}
