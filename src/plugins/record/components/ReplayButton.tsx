/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { classNameFactory } from "@utils/css";
import { openModal, React, Tooltip, useEffect, useState } from "@webpack/common";

import { getReplayDurationMs, settings } from "../settings";
import { replayManager, ReplaySnapshot } from "../utils/ReplayManager";
import { CheckIcon, LogsIcon, MoreIcon, PowerIcon, ReplayIcon, SettingsIcon } from "./icons";
import { ReplayLibraryModal } from "./ReplayLibraryModal";
import { SettingsModal } from "./SettingsModal";

const cl = classNameFactory("vc-voice-replay-");

const RING_RADIUS = 15;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function getTooltip(snapshot: ReplaySnapshot) {
    switch (snapshot.state) {
        case "buffering": {
            const total = Math.round(getReplayDurationMs() / 1000);
            const buffered = Math.min(total, Math.round(snapshot.seconds));
            return `Save the last ${buffered}s / ${total}s`;
        }
        case "saving":
            return "Saving replay...";
        case "error":
            return snapshot.error ?? "VoiceReplay error — click to retry";
        case "disabled":
            return snapshot.error ?? "VoiceReplay unavailable";
        default:
            return "VoiceReplay off — click to start";
    }
}

function ProgressRing({ progress }: { progress: number; }) {
    const offset = RING_CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, progress)));

    return (
        <svg className={cl("ring")} viewBox="0 0 34 34" aria-hidden="true">
            <circle className={cl("ring-track")} cx="17" cy="17" r={RING_RADIUS} />
            <circle
                className={cl("ring-fill")}
                cx="17"
                cy="17"
                r={RING_RADIUS}
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={offset}
            />
        </svg>
    );
}

function Menu({ active, onClose }: { active: boolean; onClose(): void; }) {
    return (
        <div className={cl("menu")} onClick={event => event.stopPropagation()}>
            <button
                className={cl("menu-item")}
                onClick={() => { active ? replayManager.stop() : void replayManager.start(); onClose(); }}
            >
                <PowerIcon width={16} height={16} />
                {active ? "Turn off" : "Turn on"}
            </button>
            <button
                className={cl("menu-item")}
                onClick={() => { openModal(props => <ReplayLibraryModal {...props} />); onClose(); }}
            >
                <LogsIcon width={16} height={16} />
                Library
            </button>
            <button
                className={cl("menu-item")}
                onClick={() => { openModal(props => <SettingsModal {...props} />); onClose(); }}
            >
                <SettingsIcon width={16} height={16} />
                Settings
            </button>
        </div>
    );
}

function ReplayButton() {
    const [snapshot, setSnapshot] = useState<ReplaySnapshot>(() => replayManager.getSnapshot());
    const [saved, setSaved] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const s = settings.use(["animatedButton"]);
    const active = snapshot.state === "buffering";
    const progress = active ? snapshot.seconds / (getReplayDurationMs() / 1000) : 0;
    const Icon = saved ? CheckIcon : ReplayIcon;

    useEffect(() => {
        const unsubscribe = replayManager.subscribe(setSnapshot);
        return () => void unsubscribe();
    }, []);

    useEffect(() => {
        if (!menuOpen) return;
        const close = () => setMenuOpen(false);
        document.addEventListener("click", close);
        return () => document.removeEventListener("click", close);
    }, [menuOpen]);

    async function handleMainClick() {
        if (snapshot.state === "idle" || snapshot.state === "error") {
            await replayManager.start();
            return;
        }
        if (snapshot.state !== "buffering") return;

        await replayManager.saveReplay();
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1200);
    }

    return (
        <span className={cl("controls")}>
            <Tooltip text={getTooltip(snapshot)} position="top">
                {tooltipProps => (
                    <button
                        {...tooltipProps}
                        type="button"
                        className={cl("voice-button", "voice-button-main", {
                            "voice-button-active": active,
                            "voice-button-saving": snapshot.state === "saving",
                            "voice-button-error": snapshot.state === "error",
                            "voice-button-saved": saved,
                            "voice-button-animated": s.animatedButton
                        })}
                        aria-label={getTooltip(snapshot)}
                        disabled={snapshot.state === "disabled" || snapshot.state === "saving"}
                        onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleMainClick();
                        }}
                        onContextMenu={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            openModal(props => <SettingsModal {...props} />);
                        }}
                    >
                        {active && <ProgressRing progress={progress} />}
                        <Icon width={18} height={18} />
                    </button>
                )}
            </Tooltip>

            <div className={cl("menu-wrap")}>
                <Tooltip text="VoiceReplay menu" position="top">
                    {tooltipProps => (
                        <button
                            {...tooltipProps}
                            type="button"
                            className={cl("voice-button", "voice-button-more", { "voice-button-more-open": menuOpen })}
                            aria-label="VoiceReplay menu"
                            onClick={event => {
                                event.preventDefault();
                                event.stopPropagation();
                                setMenuOpen(open => !open);
                            }}
                        >
                            <MoreIcon width={18} height={18} />
                        </button>
                    )}
                </Tooltip>
                {menuOpen && <Menu active={active} onClose={() => setMenuOpen(false)} />}
            </div>
        </span>
    );
}

export default ErrorBoundary.wrap(ReplayButton, { noop: true });
