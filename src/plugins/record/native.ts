/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, desktopCapturer, dialog, session, shell } from "electron";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "fs/promises";
import { basename, dirname, extname, isAbsolute, join, normalize } from "path";

type CaptureMode = "discordFrame" | "systemLoopback";

let displayHandlerInstalled = false;
let permissionHandlerInstalled = false;

function getDefaultReplayDir() {
    return join(app.getPath("music"), "VoiceReplay");
}

function sanitizeFilename(filename: string) {
    const safe = basename(filename).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 180);
    return safe || "voice-replay.webm";
}

function resolveReplayDir(folder?: string) {
    const trimmed = folder?.trim();
    return trimmed && isAbsolute(trimmed) ? normalize(trimmed) : getDefaultReplayDir();
}

export async function saveReplay(_, bytes: Uint8Array, filename: string, folder?: string) {
    const outputPath = join(resolveReplayDir(folder), sanitizeFilename(filename));
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, Buffer.from(bytes));
    return outputPath;
}

export async function pickOutputFolder() {
    const result = await dialog.showOpenDialog({
        title: "Choose VoiceReplay output folder",
        properties: ["openDirectory", "createDirectory"]
    });

    return result.canceled ? null : result.filePaths[0];
}

function isDiscordOrigin(value: string | undefined) {
    if (!value) return false;

    try {
        const host = new URL(value).hostname;
        return host === "discord.com" || host.endsWith(".discord.com");
    } catch {
        return value.includes("discord.com");
    }
}

function installPermissionHandler() {
    if (permissionHandlerInstalled) return;

    const electronSession = session.defaultSession as any;

    if (typeof electronSession.setPermissionCheckHandler === "function") {
        electronSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) => {
            if (permission === "display-capture" || permission === "media") {
                return isDiscordOrigin(details?.requestingUrl ?? requestingOrigin) || true;
            }
            return true;
        });
    }

    if (typeof electronSession.setPermissionRequestHandler === "function") {
        electronSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(true));
    }

    permissionHandlerInstalled = true;
}

export async function installOutputAudioCaptureHandler(_, mode: CaptureMode = "discordFrame") {
    installPermissionHandler();

    const electronSession = session.defaultSession as any;
    if (typeof electronSession.setDisplayMediaRequestHandler !== "function") return false;

    electronSession.setDisplayMediaRequestHandler((request, callback) => {
        desktopCapturer.getSources({
            types: ["screen"],
            thumbnailSize: { width: 0, height: 0 },
            fetchWindowIcons: false
        }).then(sources => {
            const source = sources[0];
            if (!source) {
                callback({});
                return;
            }

            if (mode === "discordFrame" && request.frame) {
                callback({ video: source, audio: request.frame, enableLocalEcho: true } as any);
                return;
            }

            callback({ video: source, audio: "loopback" } as any);
        }).catch(() => callback({}));
    }, { useSystemPicker: false });

    displayHandlerInstalled = true;
    return true;
}

export async function clearOutputAudioCaptureHandler() {
    const electronSession = session.defaultSession as any;

    if (displayHandlerInstalled && typeof electronSession.setDisplayMediaRequestHandler === "function") {
        electronSession.setDisplayMediaRequestHandler(null);
        displayHandlerInstalled = false;
    }

    return true;
}

export async function showReplayInFolder(_, filePath: string) {
    if (filePath && extname(filePath)) shell.showItemInFolder(filePath);
}

export async function listReplayFiles(_, folder?: string) {
    const root = resolveReplayDir(folder);

    try {
        const entries = await readdir(root);
        const files = await Promise.all(entries
            .filter(file => /\.(mp3|wav|webm)$/i.test(file))
            .map(async filename => {
                const filePath = join(root, filename);
                const info = await stat(filePath);
                return {
                    filePath,
                    filename,
                    bytes: info.size,
                    savedAt: info.mtimeMs,
                    format: extname(filename).slice(1).toLowerCase()
                };
            }));

        return files.sort((a, b) => b.savedAt - a.savedAt);
    } catch {
        return [];
    }
}

export async function readReplayFile(_, filePath: string) {
    filePath = normalize(filePath);

    if (!/\.(mp3|wav|webm)$/i.test(basename(filePath))) return null;

    try {
        const buf = await readFile(filePath);
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch {
        return null;
    }
}

export async function deleteReplayFile(_, filePath: string) {
    filePath = normalize(filePath);

    if (!/\.(mp3|wav|webm)$/i.test(basename(filePath))) return false;

    try {
        await rm(filePath);
        return true;
    } catch {
        return false;
    }
}
