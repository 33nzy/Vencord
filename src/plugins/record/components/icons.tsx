/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IconProps } from "@utils/types";

export function ReplayIcon({ width = 20, height = 20, className }: IconProps) {
    return (
        <svg className={className} width={width} height={height} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M12 4a8 8 0 1 1-7.45 10.93 1 1 0 1 1 1.86-.74A6 6 0 1 0 7.1 8H10a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1V3a1 1 0 0 1 2 0v3.04A7.98 7.98 0 0 1 12 4Z" />
            <path fill="currentColor" d="M10 8.85a1 1 0 0 1 1.53-.85l4.48 2.8a1 1 0 0 1 0 1.7l-4.48 2.8A1 1 0 0 1 10 14.45Z" />
        </svg>
    );
}

export function CheckIcon({ width = 20, height = 20, className }: IconProps) {
    return (
        <svg className={className} width={width} height={height} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M9.55 17.6a1 1 0 0 1-.7-.29l-4.1-4.1a1 1 0 0 1 1.41-1.42l3.39 3.39 8.29-8.29a1 1 0 1 1 1.41 1.42l-9 9a1 1 0 0 1-.7.29Z" />
        </svg>
    );
}

export function LogsIcon({ width = 20, height = 20, className }: IconProps) {
    return (
        <svg className={className} width={width} height={height} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M5 4a2 2 0 0 1 2-2h8.17c.53 0 1.04.21 1.41.59l2.83 2.83c.38.37.59.88.59 1.41V20a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4Zm10 0v3a1 1 0 0 0 1 1h3" />
            <path fill="currentColor" d="M8 11a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H9a1 1 0 0 1-1-1ZM8 15a1 1 0 0 1 1-1h7a1 1 0 1 1 0 2H9a1 1 0 0 1-1-1ZM8 19a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2H9a1 1 0 0 1-1-1Z" />
        </svg>
    );
}

export function PowerIcon({ width = 20, height = 20, className }: IconProps) {
    return (
        <svg className={className} width={width} height={height} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M12 3a1 1 0 0 1 1 1v8a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1Z" />
            <path fill="currentColor" d="M7.05 6.64a1 1 0 0 1 1.41 1.42 5 5 0 1 0 7.08 0 1 1 0 1 1 1.41-1.42 7 7 0 1 1-9.9 0Z" />
        </svg>
    );
}

export function PlayIcon({ width = 20, height = 20, className }: IconProps) {
    return (
        <svg className={className} width={width} height={height} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M8 5.85a1.5 1.5 0 0 1 2.28-1.28l8.05 4.95a1.5 1.5 0 0 1 0 2.56l-8.05 4.95A1.5 1.5 0 0 1 8 15.75v-9.9Z" />
        </svg>
    );
}

export function PauseIcon({ width = 20, height = 20, className }: IconProps) {
    return (
        <svg className={className} width={width} height={height} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M8 4a1.5 1.5 0 0 0-1.5 1.5v13a1.5 1.5 0 0 0 3 0v-13A1.5 1.5 0 0 0 8 4Zm8 0a1.5 1.5 0 0 0-1.5 1.5v13a1.5 1.5 0 0 0 3 0v-13A1.5 1.5 0 0 0 16 4Z" />
        </svg>
    );
}

export function CloseIcon({ width = 18, height = 18, className }: IconProps) {
    return (
        <svg className={className} width={width} height={height} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M6.3 6.3a1 1 0 0 1 1.4 0l4.3 4.3 4.3-4.3a1 1 0 1 1 1.4 1.4L13.4 12l4.3 4.3a1 1 0 0 1-1.4 1.4L12 13.4l-4.3 4.3a1 1 0 0 1-1.4-1.4l4.3-4.3-4.3-4.3a1 1 0 0 1 0-1.4Z" />
        </svg>
    );
}

export function MoreIcon({ width = 20, height = 20, className }: IconProps) {
    return (
        <svg className={className} width={width} height={height} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
        </svg>
    );
}

export function SettingsIcon({ width = 18, height = 18, className }: IconProps) {
    return (
        <svg className={className} width={width} height={height} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d="M10.56 2.4a1.5 1.5 0 0 0-1.42 1.02l-.38 1.13a7.8 7.8 0 0 0-1.36.79l-1.17-.27a1.5 1.5 0 0 0-1.63.72l-1.44 2.5a1.5 1.5 0 0 0 .2 1.77l.8.86a7.9 7.9 0 0 0 0 1.58l-.8.86a1.5 1.5 0 0 0-.2 1.77l1.44 2.5a1.5 1.5 0 0 0 1.63.72l1.17-.27c.43.32.88.58 1.36.79l.38 1.13a1.5 1.5 0 0 0 1.42 1.02h2.88a1.5 1.5 0 0 0 1.42-1.02l.38-1.13c.48-.21.93-.47 1.36-.79l1.17.27a1.5 1.5 0 0 0 1.63-.72l1.44-2.5a1.5 1.5 0 0 0-.2-1.77l-.8-.86a7.9 7.9 0 0 0 0-1.58l.8-.86a1.5 1.5 0 0 0 .2-1.77l-1.44-2.5a1.5 1.5 0 0 0-1.63-.72l-1.17.27a7.8 7.8 0 0 0-1.36-.79l-.38-1.13a1.5 1.5 0 0 0-1.42-1.02h-2.88ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        </svg>
    );
}

export function MicIcon({ width = 16, height = 16, className }: IconProps) {
    return (
        <svg className={className} width={width} height={height} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
            <path fill="currentColor" d="M6 11a1 1 0 1 0-2 0 8 8 0 0 0 7 7.94V21a1 1 0 1 0 2 0v-2.06A8 8 0 0 0 20 11a1 1 0 1 0-2 0 6 6 0 0 1-12 0Z" />
        </svg>
    );
}

export function StopIcon({ width = 18, height = 18, className }: IconProps) {
    return (
        <svg className={className} width={width} height={height} viewBox="0 0 24 24" aria-hidden="true">
            <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" />
        </svg>
    );
}

export function AttachIcon({ width = 20, height = 20, className }: IconProps) {
    return (
        <svg className={className} width={width} height={height} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M12.24 3.76a5 5 0 0 1 7.07 7.07l-7.78 7.78a4 4 0 1 1-5.66-5.66l7.07-7.07a3 3 0 1 1 4.25 4.24l-6.72 6.72a1 1 0 0 1-1.42-1.41l6.72-6.72a1 1 0 0 0-1.41-1.42l-7.07 7.07a2 2 0 1 0 2.83 2.83l7.78-7.78a3 3 0 0 0-4.24-4.24L5.88 12.95a1 1 0 1 1-1.41-1.41l7.77-7.78Z" />
        </svg>
    );
}

export function FolderIcon({ width = 20, height = 20, className }: IconProps) {
    return (
        <svg className={className} width={width} height={height} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M3 6a3 3 0 0 1 3-3h3.17a3 3 0 0 1 2.12.88L12.41 5H18a3 3 0 0 1 3 3v1H3V6Z" />
            <path fill="currentColor" d="M3 10h18v5.5A3.5 3.5 0 0 1 17.5 19h-11A3.5 3.5 0 0 1 3 15.5V10Z" />
        </svg>
    );
}

export function ClockIcon({ width = 16, height = 16, className }: IconProps) {
    return (
        <svg className={className} width={width} height={height} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5a1 1 0 1 0-2 0v5c0 .27.11.52.3.7l3 3a1 1 0 0 0 1.4-1.4L13 11.58V7Z" />
        </svg>
    );
}

export function StorageIcon({ width = 16, height = 16, className }: IconProps) {
    return (
        <svg className={className} width={width} height={height} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M4 6c0-2.2 3.58-4 8-4s8 1.8 8 4-3.58 4-8 4-8-1.8-8-4Z" />
            <path fill="currentColor" d="M4 9.35C5.7 10.94 8.62 12 12 12s6.3-1.06 8-2.65V12c0 2.2-3.58 4-8 4s-8-1.8-8-4V9.35Z" />
            <path fill="currentColor" d="M4 15.35C5.7 16.94 8.62 18 12 18s6.3-1.06 8-2.65V18c0 2.2-3.58 4-8 4s-8-1.8-8-4v-2.65Z" />
        </svg>
    );
}

export function UsersIcon({ width = 16, height = 16, className }: IconProps) {
    return (
        <svg className={className} width={width} height={height} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 19.2C2 15.8 5.13 13 9 13s7 2.8 7 6.2c0 .44-.36.8-.8.8H2.8a.8.8 0 0 1-.8-.8ZM17.3 19.98c.45-.2.7-.67.7-1.16 0-2.28-1.12-4.34-2.93-5.75A5.5 5.5 0 0 1 22 18.3v.9c0 .44-.36.8-.8.8h-3.9ZM16.5 11a3.5 3.5 0 0 1-2.62-5.82 5.98 5.98 0 0 1 .02 5.63c.73.13 1.45.38 2.1.74.16-.36.33-.55.5-.55Z" />
        </svg>
    );
}

export function WaveIcon({ width = 16, height = 16, className }: IconProps) {
    return (
        <svg className={className} width={width} height={height} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M4 9a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-4a1 1 0 0 1 1-1ZM8 5a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1ZM12 2a1 1 0 0 1 1 1v18a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1ZM16 7a1 1 0 0 1 1 1v8a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1ZM20 10a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1Z" />
        </svg>
    );
}

export function TrashIcon({ width = 20, height = 20, className }: IconProps) {
    return (
        <svg className={className} width={width} height={height} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M9 3a2 2 0 0 0-2 2v1H4a1 1 0 1 0 0 2h1v11a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V8h1a1 1 0 1 0 0-2h-3V5a2 2 0 0 0-2-2H9Zm2 7a1 1 0 0 0-2 0v8a1 1 0 1 0 2 0v-8Zm4 0a1 1 0 1 0-2 0v8a1 1 0 1 0 2 0v-8ZM9 5h6v1H9V5Z" />
        </svg>
    );
}
