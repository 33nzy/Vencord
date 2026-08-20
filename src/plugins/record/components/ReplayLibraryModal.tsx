/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PluginNative } from "@utils/types";
import { chooseFile } from "@utils/web";
import { RenderModalProps } from "@vencord/discord-types";
import { Button, ChannelStore, DraftType, Modal, SelectedChannelStore, showToast, Toasts, UploadHandler, useEffect, useMemo, useState } from "@webpack/common";

import { settings } from "../settings";
import { getReplayHistory, removeReplayHistoryEntry, ReplayHistoryEntry } from "../utils/ReplayHistory";
import { AttachIcon, FolderIcon, PlayIcon, ReplayIcon, TrashIcon } from "./icons";
import { ReplayPlayer } from "./ReplayPlayer";

type NativeReplayFile = {
    filePath: string;
    filename: string;
    bytes: number;
    savedAt: number;
    format: string;
};

type ReplayListItem = ReplayHistoryEntry & {
    fromDisk?: boolean;
};

type NativeBytes = Uint8Array | ArrayBuffer | number[] | {
    data?: number[];
    buffer?: ArrayBuffer;
    byteOffset?: number;
    byteLength?: number;
};

function getNative() {
    return IS_WEB
        ? null
        : VencordNative.pluginHelpers?.VoiceReplay as PluginNative<typeof import("../native")> | undefined;
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(seconds: number) {
    const safe = Math.max(0, Math.round(seconds || 0));
    const minutes = Math.floor(safe / 60);
    return `${minutes}:${String(safe % 60).padStart(2, "0")}`;
}

function formatReplayTime(savedAt: number) {
    return new Date(savedAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function getInitials(name: string) {
    return name
        .split(/\s+/)
        .map(part => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "?";
}

function AvatarChip({ user, compact = false }: { user: ReplayHistoryEntry["participants"][number]; compact?: boolean; }) {
    return (
        <span className={compact ? "vc-voice-replay-library-avatar" : "vc-voice-replay-library-person"} title={user.name}>
            {user.avatarUrl
                ? <img src={user.avatarUrl} alt="" />
                : <b>{getInitials(user.name)}</b>}
            {!compact && <span>{user.name}</span>}
        </span>
    );
}

function mimeForFormat(format: string) {
    switch (format) {
        case "mp3":
            return "audio/mpeg";
        case "wav":
            return "audio/wav";
        case "ogg":
            return "audio/ogg;codecs=opus";
        case "webm":
            return "audio/webm;codecs=opus";
        default:
            return "audio/*";
    }
}

function toBytes(value: NativeBytes | null | undefined) {
    if (!value) return null;
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (Array.isArray(value)) return new Uint8Array(value);
    if (Array.isArray(value.data)) return new Uint8Array(value.data);

    if (value.buffer instanceof ArrayBuffer) {
        return new Uint8Array(value.buffer, value.byteOffset ?? 0, value.byteLength ?? value.buffer.byteLength);
    }

    return null;
}

function toBlobPart(bytes: Uint8Array) {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}

async function attachFile(file: File) {
    const channelId = SelectedChannelStore.getChannelId();
    const channel = ChannelStore.getChannel(channelId);

    if (!channel) {
        showToast("Open a text channel before attaching a replay.", Toasts.Type.FAILURE);
        return;
    }

    UploadHandler.promptToUpload([file], channel, DraftType.ChannelMessage);
}

async function attachReplay(item: ReplayListItem) {
    const Native = getNative();
    const bytes = toBytes(await Native?.readReplayFile?.(item.filePath) as NativeBytes | null);

    if (!bytes?.byteLength) {
        showToast("Could not read that replay file.", Toasts.Type.FAILURE);
        return;
    }

    await attachFile(new File([toBlobPart(bytes)], item.filename, { type: mimeForFormat(item.format) }));
}

async function chooseAndAttachAudio() {
    const file = await chooseFile("audio/*");
    if (file) await attachFile(file);
}

function mergeHistoryWithDisk(history: ReplayHistoryEntry[], diskFiles: NativeReplayFile[]) {
    const known = new Map(history.map(item => [item.filePath, item]));

    for (const file of diskFiles) {
        if (known.has(file.filePath)) continue;
        known.set(file.filePath, {
            id: file.filePath,
            filePath: file.filePath,
            filename: file.filename,
            savedAt: file.savedAt,
            durationSeconds: 0,
            bytes: file.bytes,
            format: file.format,
            mimeType: mimeForFormat(file.format),
            source: "unknown",
            bitrateKbps: settings.store.audioBitrateKbps,
            gain: settings.store.audioGain,
            participants: []
        });
    }

    return [...known.values()]
        .sort((a, b) => b.savedAt - a.savedAt)
        .slice(0, 40) as ReplayListItem[];
}

export function ReplayLibraryModal(props: RenderModalProps) {
    const [history, setHistory] = useState(() => getReplayHistory());
    const [diskFiles, setDiskFiles] = useState<NativeReplayFile[]>([]);
    const [preview, setPreview] = useState<{ filePath: string; url: string; } | null>(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        const update = () => setHistory(getReplayHistory());
        window.addEventListener("vc-voice-replay-history-change", update);
        return () => window.removeEventListener("vc-voice-replay-history-change", update);
    }, []);

    const refreshDiskFiles = () => {
        void getNative()?.listReplayFiles?.(settings.store.outputFolder || void 0).then(files => {
            if (files) setDiskFiles(files);
        });
    };

    useEffect(refreshDiskFiles, []);

    useEffect(() => () => {
        if (preview?.url) URL.revokeObjectURL(preview.url);
    }, [preview?.url]);

    const items = useMemo(() => mergeHistoryWithDisk(history, diskFiles), [history, diskFiles]);

    async function togglePreview(item: ReplayListItem) {
        if (preview?.filePath === item.filePath) {
            setPreview(null);
            return;
        }

        const bytes = toBytes(await getNative()?.readReplayFile?.(item.filePath) as NativeBytes | null);
        if (!bytes?.byteLength) {
            showToast("Could not preview that replay file.", Toasts.Type.FAILURE);
            return;
        }

        const url = URL.createObjectURL(new Blob([toBlobPart(bytes)], { type: mimeForFormat(item.format) }));
        setPreview({ filePath: item.filePath, url });
    }

    async function deleteReplay(item: ReplayListItem) {
        if (deleting) return;
        if (!window.confirm("Delete this replay from disk? This cannot be undone.")) return;

        setDeleting(true);
        try {
            await getNative()?.deleteReplayFile?.(item.filePath);
            removeReplayHistoryEntry(item.filePath);
            if (preview?.filePath === item.filePath) setPreview(null);
            refreshDiskFiles();
            showToast("Replay deleted.", Toasts.Type.SUCCESS);
        } finally {
            setDeleting(false);
        }
    }

    return (
        <Modal {...props} size="lg" title="VoiceReplay Library">
            <div className="vc-voice-replay-lib">
                <div className="vc-voice-replay-lib-head">
                    <div className="vc-voice-replay-lib-head-title">
                        Replays
                        <span className="vc-voice-replay-lib-count">{items.length}</span>
                    </div>
                    <Button size={Button.Sizes.SMALL} onClick={chooseAndAttachAudio}>Attach a file</Button>
                </div>

                {!items.length ? (
                    <div className="vc-voice-replay-lib-empty">
                        <PlayIcon width={26} height={26} />
                        <span>No replays yet. Save one with the record button.</span>
                    </div>
                ) : items.map(item => {
                    const open = preview?.filePath === item.filePath;
                    const people = item.participants.length;
                    return (
                        <div className={`vc-voice-replay-lib-item${open ? " vc-voice-replay-lib-item-open" : ""}`} key={item.filePath}>
                            <div className="vc-voice-replay-lib-row">
                                <button
                                    className={`vc-voice-replay-lib-art${open ? " vc-voice-replay-lib-art-on" : ""}`}
                                    onClick={() => void togglePreview(item)}
                                    title={open ? "Close" : "Play"}
                                >
                                    {item.guildIconUrl
                                        ? <img src={item.guildIconUrl} alt="" />
                                        : <span className="vc-voice-replay-lib-art-fallback"><ReplayIcon width={22} height={22} /></span>}
                                    <span className="vc-voice-replay-lib-art-play"><PlayIcon width={20} height={20} /></span>
                                </button>

                                <div className="vc-voice-replay-lib-info">
                                    <div className="vc-voice-replay-lib-titlerow">
                                        <span className="vc-voice-replay-lib-title">{item.channelName ? `#${item.channelName}` : item.guildName ?? "Voice replay"}</span>
                                        <span className="vc-voice-replay-lib-badge">{item.format.toUpperCase()}</span>
                                        {item.stems && <span className="vc-voice-replay-lib-badge vc-voice-replay-lib-badge-alt">STEMS</span>}
                                    </div>
                                    <div className="vc-voice-replay-lib-sub">
                                        {item.guildName ? `${item.guildName} · ` : ""}{formatReplayTime(item.savedAt)} · {formatDuration(item.durationSeconds)} · {formatBytes(item.bytes)}
                                        {people ? ` · ${people} ${people === 1 ? "person" : "people"}` : ""}
                                    </div>
                                </div>

                                {!!item.participants.length && (
                                    <div className="vc-voice-replay-lib-people">
                                        {item.participants.slice(0, 4).map(user => <AvatarChip key={user.id} user={user} compact />)}
                                    </div>
                                )}

                                <div className="vc-voice-replay-lib-actions">
                                    <button className="vc-voice-replay-lib-act" title="Attach to chat" onClick={() => void attachReplay(item)}>
                                        <AttachIcon width={16} height={16} />
                                    </button>
                                    <button className="vc-voice-replay-lib-act" title="Show in folder" onClick={() => getNative()?.showReplayInFolder?.(item.filePath)}>
                                        <FolderIcon width={16} height={16} />
                                    </button>
                                    <button className="vc-voice-replay-lib-act vc-voice-replay-lib-act-danger" title="Delete" disabled={deleting} onClick={() => void deleteReplay(item)}>
                                        <TrashIcon width={16} height={16} />
                                    </button>
                                </div>
                            </div>

                            {open && (
                                <div className="vc-voice-replay-lib-preview">
                                    <ReplayPlayer
                                        src={preview!.url}
                                        participants={item.participants}
                                        timeline={item.speakingTimeline}
                                        duration={item.durationSeconds}
                                        stems={item.stems}
                                        autoPlay
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </Modal>
    );
}
