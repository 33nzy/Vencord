/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, useEffect, useMemo, useRef, useState } from "@webpack/common";

import { ReplayHistoryEntry, SpeakingSegment } from "../utils/ReplayHistory";
import { PauseIcon, PlayIcon } from "./icons";

type Participant = ReplayHistoryEntry["participants"][number];

const SPEAKER_COLORS = ["#5865f2", "#3ba55d", "#faa61a", "#ed4245", "#eb459e", "#00a8fc", "#f47fff", "#57f287"];

function colorForIndex(index: number) {
    return SPEAKER_COLORS[index % SPEAKER_COLORS.length];
}

function formatTime(seconds: number) {
    const safe = Math.max(0, Math.floor(seconds || 0));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function getInitials(name: string) {
    return name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "?";
}

interface StemGraph {
    ctx: AudioContext;
    source: MediaElementAudioSourceNode;
    others?: GainNode;
    you?: GainNode;
    master: GainNode;
}

function Avatar({ participant, size, speaking, color, onClick }: { participant: Participant; size: number; speaking: boolean; color: string; onClick?(): void; }) {
    const style = { width: size, height: size, "--vc-speaker-color": color } as React.CSSProperties;

    return (
        <button
            type="button"
            className={`vc-voice-replay-player-avatar${speaking ? " vc-voice-replay-player-avatar-speaking" : ""}`}
            style={style}
            title={onClick ? `Jump to ${participant.name}'s parts` : participant.name}
            onClick={onClick}
        >
            {participant.avatarUrl ? <img src={participant.avatarUrl} alt="" /> : <b>{getInitials(participant.name)}</b>}
        </button>
    );
}

export function ReplayPlayer({ src, participants, timeline, duration, stems, autoPlay }: {
    src: string;
    participants: Participant[];
    timeline?: SpeakingSegment[];
    duration: number;
    stems?: boolean;
    autoPlay?: boolean;
}) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const graphRef = useRef<StemGraph | null>(null);
    const [playing, setPlaying] = useState(false);
    const [current, setCurrent] = useState(0);
    const [total, setTotal] = useState(duration || 0);
    const [volume, setVolume] = useState(1);
    const [muteOthers, setMuteOthers] = useState(false);
    const [muteYou, setMuteYou] = useState(false);

    const colorById = useMemo(() => {
        const map = new Map<string, string>();
        participants.forEach((participant, index) => map.set(participant.id, colorForIndex(index)));
        return map;
    }, [participants]);

    const segmentsById = useMemo(() => {
        const map = new Map<string, SpeakingSegment[]>();
        for (const segment of timeline ?? []) {
            const list = map.get(segment.id) ?? [];
            list.push(segment);
            map.set(segment.id, list);
        }
        return map;
    }, [timeline]);

    const activeIds = useMemo(() => {
        const ids = new Set<string>();
        for (const segment of timeline ?? []) {
            if (current >= segment.start - 0.15 && current <= segment.end + 0.15) ids.add(segment.id);
        }
        return ids;
    }, [timeline, current]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        let frame = 0;
        const tick = () => { setCurrent(audio.currentTime); frame = requestAnimationFrame(tick); };
        const onPlay = () => { setPlaying(true); frame = requestAnimationFrame(tick); };
        const onPause = () => { setPlaying(false); cancelAnimationFrame(frame); setCurrent(audio.currentTime); };
        const onLoaded = () => { if (Number.isFinite(audio.duration) && audio.duration > 0) setTotal(audio.duration); };
        const onEnded = () => { setPlaying(false); cancelAnimationFrame(frame); setCurrent(0); };

        audio.addEventListener("play", onPlay);
        audio.addEventListener("pause", onPause);
        audio.addEventListener("loadedmetadata", onLoaded);
        audio.addEventListener("ended", onEnded);

        return () => {
            cancelAnimationFrame(frame);
            audio.removeEventListener("play", onPlay);
            audio.removeEventListener("pause", onPause);
            audio.removeEventListener("loadedmetadata", onLoaded);
            audio.removeEventListener("ended", onEnded);
        };
    }, [src]);

    useEffect(() => {
        const audio = audioRef.current;
        const AudioCtx = window.AudioContext;
        if (!audio || !AudioCtx) return;

        const ctx = new AudioCtx();
        const source = ctx.createMediaElementSource(audio);
        const master = ctx.createGain();
        let others: GainNode | undefined;
        let you: GainNode | undefined;

        if (stems) {
            const splitter = ctx.createChannelSplitter(2);
            others = ctx.createGain();
            you = ctx.createGain();
            const merger = ctx.createChannelMerger(2);
            source.connect(splitter);
            splitter.connect(others, 0);
            splitter.connect(you, 1);
            others.connect(merger, 0, 0);
            others.connect(merger, 0, 1);
            you.connect(merger, 0, 0);
            you.connect(merger, 0, 1);
            merger.connect(master);
        } else {
            source.connect(master);
        }

        master.connect(ctx.destination);
        void ctx.resume();

        graphRef.current = { ctx, source, others, you, master };

        return () => {
            graphRef.current = null;
            try { source.disconnect(); } catch { }
            void ctx.close();
        };
    }, [src, stems]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !autoPlay) return;
        void graphRef.current?.ctx.resume();
        const id = window.setTimeout(() => void audio.play().catch(() => void 0), 40);
        return () => window.clearTimeout(id);
    }, [src]);

    useEffect(() => {
        const graph = graphRef.current;
        if (graph) {
            if (graph.others) graph.others.gain.value = muteOthers ? 0 : 1;
            if (graph.you) graph.you.gain.value = muteYou ? 0 : 1;
            graph.master.gain.value = volume;
        } else if (audioRef.current) {
            audioRef.current.volume = Math.min(1, volume);
        }
    }, [volume, muteOthers, muteYou, stems]);

    const progress = total ? Math.min(1, current / total) : 0;
    const speakingParticipants = participants.filter(participant => activeIds.has(participant.id));
    const nowSpeaking = speakingParticipants.length ? speakingParticipants.map(participant => participant.name).join(", ") : null;

    function togglePlay() {
        const audio = audioRef.current;
        if (!audio) return;
        void graphRef.current?.ctx.resume();
        if (audio.paused) void audio.play().catch(() => void 0);
        else audio.pause();
    }

    function seekTo(event: React.MouseEvent<HTMLDivElement>) {
        const audio = audioRef.current;
        if (!audio || !total) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        audio.currentTime = ratio * total;
        setCurrent(audio.currentTime);
    }

    function jumpToPerson(id: string) {
        const audio = audioRef.current;
        const segments = (segmentsById.get(id) ?? []).slice().sort((a, b) => a.start - b.start);
        if (!audio || !segments.length) return;
        const next = segments.find(segment => segment.start > current + 0.1) ?? segments[0];
        audio.currentTime = next.start;
        setCurrent(next.start);
        if (audio.paused) void audio.play().catch(() => void 0);
    }

    const lanes = participants.filter(participant => segmentsById.has(participant.id));

    return (
        <div className="vc-voice-replay-player">
            <audio ref={audioRef} src={src} preload="auto" />

            {!!participants.length && (
                <div className="vc-voice-replay-player-stage">
                    <div className="vc-voice-replay-player-speakers">
                        {participants.map(participant => (
                            <Avatar
                                key={participant.id}
                                participant={participant}
                                size={46}
                                speaking={activeIds.has(participant.id)}
                                color={colorById.get(participant.id) ?? SPEAKER_COLORS[0]}
                                onClick={segmentsById.has(participant.id) ? () => jumpToPerson(participant.id) : void 0}
                            />
                        ))}
                    </div>
                    <div className="vc-voice-replay-player-now">
                        {nowSpeaking
                            ? <><span className="vc-voice-replay-player-now-dot" /> {nowSpeaking}</>
                            : <span className="vc-voice-replay-player-now-idle">{playing ? "Silence" : "Paused"}</span>}
                    </div>
                </div>
            )}

            {stems && (
                <div className="vc-voice-replay-player-stems">
                    <span className="vc-voice-replay-player-stems-label">Isolate</span>
                    <button
                        type="button"
                        className={`vc-voice-replay-player-stem${muteOthers ? " vc-voice-replay-player-stem-off" : ""}`}
                        onClick={() => setMuteOthers(v => !v)}
                    >
                        {muteOthers ? "Others muted" : "Others"}
                    </button>
                    <button
                        type="button"
                        className={`vc-voice-replay-player-stem${muteYou ? " vc-voice-replay-player-stem-off" : ""}`}
                        onClick={() => setMuteYou(v => !v)}
                    >
                        {muteYou ? "You muted" : "You"}
                    </button>
                </div>
            )}

            <div className="vc-voice-replay-player-bar">
                <button type="button" className="vc-voice-replay-player-play" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
                    {playing ? <PauseIcon width={22} height={22} /> : <PlayIcon width={22} height={22} />}
                </button>

                <div className="vc-voice-replay-player-track">
                    <div className="vc-voice-replay-player-seek" onClick={seekTo}>
                        <div className="vc-voice-replay-player-seek-fill" style={{ width: `${progress * 100}%` }} />
                        <div className="vc-voice-replay-player-seek-thumb" style={{ left: `${progress * 100}%` }} />
                    </div>
                    <div className="vc-voice-replay-player-times">
                        <span>{formatTime(current)}</span>
                        <span>{formatTime(total)}</span>
                    </div>
                </div>

                <div className="vc-voice-replay-player-volume">
                    <input type="range" min={0} max={2} step={0.05} value={volume} onChange={event => setVolume(Number(event.target.value))} aria-label="Volume" />
                </div>
            </div>

            {!!lanes.length && (
                <div className="vc-voice-replay-player-lanes">
                    {lanes.map(participant => {
                        const color = colorById.get(participant.id) ?? SPEAKER_COLORS[0];
                        const speaking = activeIds.has(participant.id);
                        return (
                            <div className={`vc-voice-replay-player-lane${speaking ? " vc-voice-replay-player-lane-active" : ""}`} key={participant.id}>
                                <Avatar participant={participant} size={24} speaking={speaking} color={color} onClick={() => jumpToPerson(participant.id)} />
                                <div className="vc-voice-replay-player-lane-track">
                                    {(segmentsById.get(participant.id) ?? []).map((segment, index) => (
                                        <span
                                            key={index}
                                            className="vc-voice-replay-player-lane-seg"
                                            style={{
                                                left: `${total ? (segment.start / total) * 100 : 0}%`,
                                                width: `${total ? Math.max(0.8, ((segment.end - segment.start) / total) * 100) : 0}%`,
                                                background: color
                                            }}
                                        />
                                    ))}
                                    <div className="vc-voice-replay-player-lane-head" style={{ left: `${progress * 100}%` }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
