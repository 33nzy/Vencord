/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PluginNative } from "@utils/types";
import { RenderModalProps } from "@vencord/discord-types";
import { Button, Forms, Modal, Select, Switch, Text, TextInput, useEffect, useState } from "@webpack/common";
import type { ReactNode } from "react";

import { ReplayFormat, settings } from "../settings";

const FormSwitch = Switch as any;

interface AudioInputDevice {
    deviceId: string;
    label: string;
}

function getNative() {
    return IS_WEB
        ? null
        : VencordNative.pluginHelpers?.VoiceReplay as PluginNative<typeof import("../native")> | undefined;
}

function Section({ title, children }: { title: string; children: ReactNode; }) {
    return (
        <section className="vc-voice-replay-section">
            <Forms.FormTitle tag="h4" className="vc-voice-replay-section-title">{title}</Forms.FormTitle>
            <div className="vc-voice-replay-grid">{children}</div>
        </section>
    );
}

function Field({ label, note, wide, children }: { label: string; note?: string; wide?: boolean; children: ReactNode; }) {
    return (
        <div className={`vc-voice-replay-setting${wide ? " vc-voice-replay-setting-wide" : ""}`}>
            <Forms.FormTitle>{label}</Forms.FormTitle>
            {children}
            {note && <Forms.FormText>{note}</Forms.FormText>}
        </div>
    );
}

function NumberInput({ label, note, value, onChange }: { label: string; note?: string; value: number; onChange(value: number): void; }) {
    const [local, setLocal] = useState(String(value));

    return (
        <Field label={label} note={note}>
            <TextInput
                type="number"
                value={local}
                onChange={next => {
                    setLocal(next);
                    const parsed = Number(next);
                    if (!Number.isNaN(parsed)) onChange(parsed);
                }}
            />
        </Field>
    );
}

function Toggle({ label, note, settingKey }: { label: string; note?: string; settingKey: keyof typeof settings.store; }) {
    const s = settings.use([settingKey as any]);

    return (
        <FormSwitch
            value={Boolean(s[settingKey])}
            onChange={value => settings.store[settingKey] = value as never}
            note={note}
        >
            {label}
        </FormSwitch>
    );
}

function MicrophoneSelect() {
    const s = settings.use(["inputDeviceId" as any]);
    const [devices, setDevices] = useState<AudioInputDevice[]>([]);

    async function refreshDevices(requestPermission = false) {
        if (!navigator.mediaDevices?.enumerateDevices) return;

        let permissionStream: MediaStream | undefined;
        if (requestPermission) {
            try {
                permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            } catch {
            } finally {
                permissionStream?.getTracks().forEach(track => track.stop());
            }
        }

        const inputs = (await navigator.mediaDevices.enumerateDevices())
            .filter(device => device.kind === "audioinput")
            .map((device, index) => ({
                deviceId: device.deviceId,
                label: device.label || `Microphone ${index + 1}`
            }));

        setDevices(inputs);
    }

    useEffect(() => {
        const handleDeviceChange = () => void refreshDevices();

        void refreshDevices();
        navigator.mediaDevices?.addEventListener?.("devicechange", handleDeviceChange);
        return () => navigator.mediaDevices?.removeEventListener?.("devicechange", handleDeviceChange);
    }, []);

    const options = [
        { label: "Discord / system default", value: "" },
        ...devices.map(device => ({
            label: device.label,
            value: device.deviceId
        }))
    ];

    return (
        <Field label="Microphone" note="Which mic gets mixed into the replay." wide>
            <div className="vc-voice-replay-row">
                <Select
                    placeholder="Microphone input"
                    options={options}
                    select={value => settings.store.inputDeviceId = String(value)}
                    isSelected={value => value === (s.inputDeviceId ?? "")}
                    serialize={String}
                    closeOnSelect
                />
                <Button size={Button.Sizes.SMALL} onClick={() => void refreshDevices(true)}>
                    Refresh
                </Button>
            </div>
        </Field>
    );
}

export function SettingsModal(props: RenderModalProps) {
    const s = settings.use();
    const [folder, setFolder] = useState(settings.store.outputFolder ?? "");

    return (
        <Modal
            {...props}
            size="md"
            title="VoiceReplay Settings"
            actions={[{ text: "Done", variant: "primary", onClick: props.onClose }]}
        >
            <div className="vc-voice-replay-settings">
                <div className="vc-voice-replay-disclaimer">
                    <Text variant="text-sm/normal">
                        VoiceReplay keeps audio local on this device. Make sure everyone in the call knows you are buffering voice audio and follow your local recording and consent laws.
                    </Text>
                </div>

                <Section title="Capture">
                    <Field label="Replay Duration">
                        <Select
                            placeholder="Duration"
                            options={[
                                { label: "30 seconds", value: 30 },
                                { label: "60 seconds", value: 60 },
                                { label: "2 minutes", value: 120 },
                                { label: "5 minutes", value: 300 },
                                { label: "Custom", value: 0 }
                            ]}
                            select={value => settings.store.replayDuration = value as never}
                            isSelected={value => value === s.replayDuration}
                            serialize={String}
                            closeOnSelect
                        />
                    </Field>

                    <NumberInput
                        label="Custom Duration (seconds)"
                        note="Used when Replay Duration is set to Custom. 5-600."
                        value={s.customReplayDuration}
                        onChange={value => settings.store.customReplayDuration = Math.max(5, Math.min(600, value))}
                    />

                    <Field label="Call Audio" note="System audio always captures the whole call. Use Discord window only if you don't want other app sounds and voices still record." wide>
                        <Select
                            placeholder="Call audio source"
                            options={[
                                { label: "System audio (recommended)", value: "loopback" },
                                { label: "Discord window only", value: "frame" }
                            ]}
                            select={value => settings.store.captureMode = value as never}
                            isSelected={value => value === s.captureMode}
                            serialize={String}
                            closeOnSelect
                        />
                    </Field>

                    <MicrophoneSelect />

                    <div className="vc-voice-replay-setting vc-voice-replay-setting-wide">
                        <Toggle
                            settingKey="includeMicrophone"
                            label="Record my microphone"
                            note="Mixes your own voice into the replay. When you mute or deafen in Discord, your mic is left out automatically."
                        />
                    </div>

                    <div className="vc-voice-replay-setting vc-voice-replay-setting-wide">
                        <Toggle
                            settingKey="stopMicWhenMuted"
                            label="Skip my mic while muted"
                            note="When on, your mic is left out of the replay while you are muted or deafened in Discord. If your voice is missing from recordings, turn this OFF."
                        />
                    </div>

                    <div className="vc-voice-replay-setting vc-voice-replay-setting-wide">
                        <Toggle
                            settingKey="separateStems"
                            label="Separate call and mic (advanced)"
                            note="Records the call and your mic on separate channels so you can mute either side in the preview. Leave off for a normal mixed recording."
                        />
                    </div>
                </Section>

                <Section title="Output">
                    <Field label="File Format" note="MP3 plays everywhere. WAV is lossless but much larger.">
                        <Select
                            placeholder="Format"
                            options={[
                                { label: "MP3 (recommended)", value: "mp3" },
                                { label: "WAV (lossless)", value: "wav" }
                            ]}
                            select={value => settings.store.fileFormat = value as ReplayFormat}
                            isSelected={value => value === s.fileFormat}
                            serialize={String}
                            closeOnSelect
                        />
                    </Field>

                    <NumberInput
                        label="Quality (kbps)"
                        note="96-256. Applies to recording and MP3 export."
                        value={s.audioBitrateKbps}
                        onChange={value => settings.store.audioBitrateKbps = Math.max(96, Math.min(256, value))}
                    />

                    <Field label="Output Folder" wide>
                        <div className="vc-voice-replay-row">
                            <TextInput
                                value={folder}
                                placeholder="Default: Music/VoiceReplay"
                                onChange={value => {
                                    setFolder(value);
                                    settings.store.outputFolder = value;
                                }}
                            />
                            <Button
                                size={Button.Sizes.SMALL}
                                disabled={IS_WEB}
                                onClick={async () => {
                                    const path = await getNative()?.pickOutputFolder();
                                    if (path) {
                                        setFolder(path);
                                        settings.store.outputFolder = path;
                                    }
                                }}
                            >
                                Browse
                            </Button>
                        </div>
                    </Field>

                    <NumberInput
                        label="Volume Boost"
                        note="1.0-2.5. Higher values may clip loud calls."
                        value={s.audioGain}
                        onChange={value => settings.store.audioGain = Math.max(1, Math.min(2.5, value))}
                    />

                    <NumberInput
                        label="Max Buffer RAM (MB)"
                        note="Approximate memory ceiling for the rolling buffer."
                        value={s.maxRamMb}
                        onChange={value => settings.store.maxRamMb = Math.max(16, Math.min(512, value))}
                    />
                </Section>

                <Section title="Behavior">
                    <Field label="Hotkey" note="Saves the replay from anywhere in Discord.">
                        <TextInput
                            value={s.hotkey}
                            placeholder="Alt+Shift+S"
                            onChange={value => settings.store.hotkey = value}
                        />
                    </Field>

                    <div className="vc-voice-replay-setting">
                        <Toggle settingKey="autoStartBuffering" label="Auto-start in voice" note="Start buffering when you join a voice channel." />
                    </div>
                </Section>

                <div className="vc-voice-replay-toggles">
                    <Toggle settingKey="notifications" label="Toast notifications" />
                    <Toggle settingKey="soundEffect" label="Save sound effect" />
                    <Toggle settingKey="animatedButton" label="Animated button" />
                    <Toggle settingKey="timestampsInFilename" label="Timestamps in filenames" />
                </div>
            </div>
        </Modal>
    );
}
