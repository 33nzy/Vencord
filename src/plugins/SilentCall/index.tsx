/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addChatBarButton, ChatBarButton, removeChatBarButton } from "@api/ChatButtons";
import { ApplicationCommandInputType, sendBotMessage } from "@api/Commands";
import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { Devs } from "@utils/constants";
import { Menu, React } from "@webpack/common";

const settings = definePluginSettings({
    isEnabled: {
        type: OptionType.BOOLEAN,
        description: "Block call ringing",
        default: false,
    },
    showIcon: {
        type: OptionType.BOOLEAN,
        description: "Show toggle button in the chat bar",
        default: true,
        restartNeeded: true,
    },
});

let origOpen: typeof XMLHttpRequest.prototype.open | null = null;
let origSend: typeof XMLHttpRequest.prototype.send | null = null;

function installXhrPatch() {
    if (origOpen) return;
    origOpen = XMLHttpRequest.prototype.open;
    origSend = XMLHttpRequest.prototype.send;
    const _open = origOpen, _send = origSend;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._scMethod = method;
        this._scUrl = String(url);
        return _open.apply(this, arguments as any);
    };
    XMLHttpRequest.prototype.send = function (body?) {
        if (settings.store.isEnabled && this._scMethod === "POST" && this._scUrl?.includes("/call/ring")) {
            console.debug("[SilentCall] blocked /call/ring");
            return;
        }
        return _send.apply(this, arguments as any);
    };
}

function uninstallXhrPatch() {
    if (!origOpen) return;
    XMLHttpRequest.prototype.open = origOpen;
    XMLHttpRequest.prototype.send = origSend!;
    origOpen = origSend = null;
}

const toggle = () => { settings.store.isEnabled = !settings.store.isEnabled; };

// always green phone — thick red bar overlaid when disabled
function PhoneIcon({ on }: { on: boolean; }) {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24">
            {/* phone handset — always green */}
            <path
                fill="var(--green-360)"
                d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C9.6 21 3 14.4 3 6c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.3 1l-2.2 2.2z"
            />
            {/* thick red diagonal bar — only when disabled */}
            {!on && (
                <rect
                    x="11.25"
                    y="1"
                    width="3"
                    height="22"
                    rx="1.5"
                    fill="var(--red-400)"
                    transform="rotate(45 12 12)"
                />
            )}
        </svg>
    );
}

const SilentCallButton: ChatBarButton = ({ isMainChat, channel }) => {
    const { isEnabled, showIcon } = settings.use(["isEnabled", "showIcon"]);
    // only show in DMs (type 1) and Group DMs (type 3)
    if (!isMainChat || !showIcon || (channel.type !== 1 && channel.type !== 3)) return null;

    return (
        <ChatBarButton
            tooltip={isEnabled ? "Silent Call: ON" : "Silent Call: OFF"}
            onClick={toggle}
            buttonProps={{ style: { padding: "0 2px" } }}
        >
            <PhoneIcon on={isEnabled} />
        </ChatBarButton>
    );
};

const patchCtxMenu: NavContextMenuPatchCallback = (children, { channel }) => {
    if (!channel || (channel.type !== 1 && channel.type !== 3)) return;
    children.push(
        <Menu.MenuSeparator key="sc-sep" />,
        <Menu.MenuCheckboxItem
            key="sc-item"
            id="vc-silent-call"
            label="Silent Call"
            checked={settings.store.isEnabled}
            action={toggle}
        />
    );
};

export default definePlugin({
    name: "SilentCall",
    description: "Join DM/Group DM calls without ringing anyone.",
    authors: [Devs.anzyh,Devs.rz30,Devs.anzy,Devs.r],
    settings,
    dependencies: ["ChatInputButtonAPI"],

    contextMenus: {
        "user-context": patchCtxMenu,
        "gdm-context": patchCtxMenu,
    },

    commands: [{
        name: "silentcall",
        description: "Toggle silent call mode",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [],
        execute(_, ctx) {
            toggle();
            sendBotMessage(ctx.channel.id, { content: `Silent Call **${settings.store.isEnabled ? "enabled" : "disabled"}**` });
        },
    }],

    start() {
        try {
            installXhrPatch();
        } catch (e) {
            origOpen = origSend = null;
            console.error("[SilentCall] xhr patch failed:", e);
        }
        if (settings.store.showIcon) addChatBarButton("SilentCall", SilentCallButton);
    },

    stop() {
        removeChatBarButton("SilentCall");
        uninstallXhrPatch();
    },
});
