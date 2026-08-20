/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin, { ReporterTestable, StartAt } from "@utils/types";
import { Button, createRoot, FluxDispatcher, Menu, openModal, React, SelectedChannelStore } from "@webpack/common";
import { Devs } from "@utils/constants";
import { ReplayIcon } from "./components/icons";
import ReplayButton from "./components/ReplayButton";
import { ReplayLibraryModal } from "./components/ReplayLibraryModal";
import { SavePopupHost } from "./components/SavePopup";
import { settings } from "./settings";
import managedStyle from "./styles/voiceReplay.css?managed";
import { startDiscordAudioTap, stopDiscordAudioTap, forceRefreshTracks } from "./utils/DiscordAudioTap";
import { replayManager } from "./utils/ReplayManager";

let voiceButtonRoot: ReturnType<typeof createRoot> | undefined;
let voiceButtonContainer: HTMLDivElement | undefined;
let voiceButtonObserver: MutationObserver | undefined;
let mountQueued = false;

let popupRoot: ReturnType<typeof createRoot> | undefined;
let popupContainer: HTMLDivElement | undefined;

const attachMenuPatch: NavContextMenuPatchCallback = children => {
    if (children.some((child: any) => child?.props?.id === "vc-voice-replay-library")) return;

    children.unshift(
        <Menu.MenuItem
            id="vc-voice-replay-library"
            iconLeft={ReplayIcon}
            leadingAccessory={{
                type: "icon",
                icon: ReplayIcon
            }}
            label="VoiceReplay Library"
            action={() => openModal(props => <ReplayLibraryModal {...props} />)}
        />
    );
};

function normalizeHotkey(value: string) {
    return value
        .toLowerCase()
        .split("+")
        .map(part => part.trim())
        .filter(Boolean)
        .sort()
        .join("+");
}

function eventToHotkey(event: KeyboardEvent) {
    const keys: string[] = [];
    if (event.altKey) keys.push("alt");
    if (event.ctrlKey) keys.push("ctrl");
    if (event.metaKey) keys.push("meta");
    if (event.shiftKey) keys.push("shift");

    const key = event.key.toLowerCase();
    if (!["alt", "control", "meta", "shift"].includes(key)) keys.push(key);
    return keys.sort().join("+");
}

function handleHotkey(event: KeyboardEvent) {
    const expected = normalizeHotkey(settings.store.hotkey ?? "");
    if (!expected || event.repeat) return;
    if (eventToHotkey(event) !== expected) return;

    event.preventDefault();
    event.stopPropagation();
    void replayManager.saveReplay();
}

function handleSettingsChange() {
    replayManager.configure();
}

function handleRestart() {
    replayManager.restart();
}

function findVoiceButtonsContainer() {
    const containers = [...document.querySelectorAll<HTMLElement>('[class*="voiceButtonsContainer"]')];
    return containers.find(container => {
        if (!container.isConnected) return false;

        const rect = container.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;

        return !!container.querySelector("button");
    });
}

function mountVoiceButton() {
    const container = findVoiceButtonsContainer();
    if (!container) return;

    const existing = container.querySelector<HTMLDivElement>(".vc-voice-replay-native-slot");
    if (existing && existing === voiceButtonContainer && voiceButtonRoot) return;

    voiceButtonRoot?.unmount();
    if (voiceButtonContainer && voiceButtonContainer !== existing) voiceButtonContainer.remove();

    voiceButtonContainer = existing ?? document.createElement("div");
    voiceButtonContainer.className = "vc-voice-replay-native-slot";
    if (!voiceButtonContainer.parentElement) container.prepend(voiceButtonContainer);
    voiceButtonRoot = createRoot(voiceButtonContainer);
    voiceButtonRoot.render(<ReplayButton />);
}

function queueMount() {
    if (mountQueued) return;
    mountQueued = true;
    requestAnimationFrame(() => {
        mountQueued = false;
        mountVoiceButton();
    });
}

function startVoiceButtonInjector() {
    mountVoiceButton();
    voiceButtonObserver = new MutationObserver(queueMount);
    voiceButtonObserver.observe(document.body, { childList: true, subtree: true });
}

function stopVoiceButtonInjector() {
    voiceButtonObserver?.disconnect();
    voiceButtonObserver = void 0;
    voiceButtonRoot?.unmount();
    voiceButtonRoot = void 0;
    voiceButtonContainer?.remove();
    voiceButtonContainer = void 0;
}

function mountPopupHost() {
    popupContainer = document.createElement("div");
    popupContainer.className = "vc-voice-replay-popup-mount";
    document.body.appendChild(popupContainer);
    popupRoot = createRoot(popupContainer);
    popupRoot.render(<SavePopupHost />);
}

function unmountPopupHost() {
    popupRoot?.unmount();
    popupRoot = void 0;
    popupContainer?.remove();
    popupContainer = void 0;
}

function handleVoiceStateChange() {
    if (SelectedChannelStore.getVoiceChannelId()) {
        if (settings.store.autoStartBuffering && replayManager.getSnapshot().state === "idle") {
            void replayManager.start();
        }
        forceRefreshTracks();
        replayManager.syncTracks();
    } else if (settings.store.autoStartBuffering) {
        replayManager.stop();
    }
}

export default definePlugin({
    name: "VoiceReplay",
    description: "Keeps a local rolling voice replay buffer and lets you save the last seconds of audio instantly.",
    tags: ["Voice", "Privacy", "Utility"],
    authors: [{ name: "decoupage", id: 380045837457162242n },Devs.anzyh,Devs.rz30,Devs.anzy,Devs.r]
    startAt: StartAt.WebpackReady,
    reporterTestable: ReporterTestable.None,
    settings,
    managedStyle,

    contextMenus: {
        "channel-attach": attachMenuPatch
    },

    start() {
        startDiscordAudioTap();
        document.addEventListener("keydown", handleHotkey, true);
        window.addEventListener("vc-voice-replay-settings-change", handleSettingsChange);
        window.addEventListener("vc-voice-replay-restart", handleRestart);
        FluxDispatcher.subscribe("VOICE_CHANNEL_SELECT", handleVoiceStateChange);
        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", handleVoiceStateChange);

        startVoiceButtonInjector();
        mountPopupHost();
        handleVoiceStateChange();
    },

    stop() {
        document.removeEventListener("keydown", handleHotkey, true);
        window.removeEventListener("vc-voice-replay-settings-change", handleSettingsChange);
        window.removeEventListener("vc-voice-replay-restart", handleRestart);
        FluxDispatcher.unsubscribe("VOICE_CHANNEL_SELECT", handleVoiceStateChange);
        FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", handleVoiceStateChange);
        replayManager.stop();
        stopDiscordAudioTap();
        stopVoiceButtonInjector();
        unmountPopupHost();
    },

    settingsAboutComponent: () => (
        <div className="vc-voice-replay-about">
            <p>
                VoiceReplay keeps everything local and never uploads audio. It records your call and your microphone into a rolling buffer; press the hotkey or the replay button to save the last seconds.
            </p>
            <Button onClick={async () => {
                const { SettingsModal } = await import("./components/SettingsModal");
                openModal(props => <SettingsModal {...props} />);
            }}>
                Open VoiceReplay Settings
            </Button>
        </div>
    )
});
