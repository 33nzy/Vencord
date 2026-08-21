/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { HeaderBarButton } from "@api/HeaderBar";
import { definePluginSettings, useSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import type { Channel, User } from "@vencord/discord-types";
import { findByPropsLazy, findStoreLazy } from "@webpack";
import {
    Alerts,
    ChannelStore,
    Menu,
    PermissionsBits,
    PermissionStore,
    React,
    SelectedChannelStore,
    Toasts,
    UserStore
} from "@webpack/common";
import type { SVGProps } from "react";

/* ───────────────────────── Constants ───────────────────────── */

const USER_SECTION_LABEL = "Fers $tore";
const CHANNEL_SECTION_LABEL = "Fers $tore";
const CONNECT = 1n << 20n;

/* ───────────────────────── Icons ───────────────────────── */

interface IconProps extends SVGProps<SVGSVGElement> {
    className?: string;
    height?: string | number;
    width?: string | number;
}

function FollowIcon({
    width = 18,
    height = 18,
    ...props
}: IconProps) {
    return (
        <svg
            {...props}
            width={width}
            height={height}
            viewBox="0 -960 960 960"
            fill="currentColor"
        >
            <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z" />
        </svg>
    );
}

function PausedIcon({
    width = 18,
    height = 18,
    ...props
}: IconProps) {
    return (
        <svg
            {...props}
            width={width}
            height={height}
            viewBox="0 0 24 24"
            fill="currentColor"
        >
            <path d="M8 5v14l11-7L8 5Zm-2 0H4v14h2V5Zm13 0h-2v14h2V5Z" />
        </svg>
    );
}

function UnfollowIcon({
    width = 18,
    height = 18,
    ...props
}: IconProps) {
    return (
        <svg
            {...props}
            width={width}
            height={height}
            viewBox="0 -960 960 960"
            fill="currentColor"
        >
            <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z" />
        </svg>
    );
}

/* ───────────────────────── Context helper ───────────────────────── */

function injectItem(
    children: unknown,
    item: React.ReactElement,
    label: string,
    key: string
) {
    const root = children as any[];
    let section: any | null = null;

    for (const child of root) {
        if (!child || typeof child !== "object") {
            continue;
        }

        const { props } = (child as any);

        if (props?.label === label) {
            section = child;
            break;
        }
    }

    if (!section) {
        root.push(
            <Menu.MenuGroup
                key={key}
                label={label}
            >
                {item}
            </Menu.MenuGroup>
        );

        return;
    }

    const sectionChildren = Array.isArray(
        section.props.children
    )
        ? section.props.children
        : [section.props.children];

    section.props.children = [
        ...sectionChildren,
        item
    ];
}

/* ───────────────────────── Voice stores ───────────────────────── */

interface VoiceState {
    userId: string;
    channelId?: string;
    oldChannelId?: string;
    selfStream?: boolean;
    selfVideo?: boolean;
}

interface VoiceStateStoreType {
    getAllVoiceStates(): Record<
        string,
        Record<string, VoiceState>
    >;

    getVoiceStatesForChannel(
        channelId: string
    ): Record<string, VoiceState>;

    getVoiceStateForUser?(
        userId: string
    ): VoiceState | null;
}

const VoiceStateStore: VoiceStateStoreType =
    findStoreLazy("VoiceStateStore");

const ChannelActions: {
    disconnect: () => void;
    selectVoiceChannel: (channelId: string) => void;
} = findByPropsLazy(
    "disconnect",
    "selectVoiceChannel"
);

/* ───────────────────────── Settings ───────────────────────── */

export const settings = definePluginSettings({
    executeOnFollow: {
        type: OptionType.BOOLEAN,
        description: "الانتقال مباشرة إلى روم الهدف عند إضافة الفولو",
        default: true,
        restartNeeded: false
    },

    onlyManualTrigger: {
        type: OptionType.BOOLEAN,
        description: "تشغيل الانتقال فقط عند الضغط على زر الفولو",
        default: false,
        restartNeeded: false
    },

    followLeave: {
        type: OptionType.BOOLEAN,
        description: "فصل الصوت عندما يخرج الهدف من الروم",
        default: false,
        restartNeeded: false
    },

    autoMoveBack: {
        type: OptionType.BOOLEAN,
        description: "الرجوع تلقائيًا إلى روم الهدف إذا تم نقلك",
        default: false,
        restartNeeded: false
    },

    autoRejoin: {
        type: OptionType.BOOLEAN,
        description: "إعادة الدخول تلقائيًا إلى روم الهدف إذا خرجت",
        default: false,
        restartNeeded: false
    },

    allowFollowWhileStreaming: {
        type: OptionType.BOOLEAN,
        description:
            "السماح بالانتقال مع الهدف أثناء مشاركة الشاشة أو تشغيل الكاميرا",
        default: true,
        restartNeeded: false
    },

    channelFull: {
        type: OptionType.BOOLEAN,
        description: "منع الدخول إلى الروم إذا كان ممتلئًا",
        default: true,
        restartNeeded: false
    },

    followUserIds: {
        type: OptionType.STRING,
        description: "قائمة المستخدمين المتابَعين",
        default: "",
        hidden: true,
        restartNeeded: false
    },

    currentFollowId: {
        type: OptionType.STRING,
        description: "الهدف الحالي",
        default: "",
        hidden: true,
        restartNeeded: false
    },

    followUserId: {
        type: OptionType.STRING,
        description: "للتوافق مع النسخ القديمة",
        default: "",
        hidden: true,
        restartNeeded: false
    },

    paused: {
        type: OptionType.BOOLEAN,
        description: "إيقاف الفولو مؤقتًا بدون حذف الهدف",
        default: false,
        hidden: true,
        restartNeeded: false
    }
});

/* ───────────────────────── State helpers ───────────────────────── */

function showMessage(
    message: string,
    type: "success" | "info" | "error"
) {
    const toastType =
        type === "success"
            ? Toasts.Type.SUCCESS
            : type === "info"
                ? Toasts.Type.INFO
                : Toasts.Type.FAILURE;

    Toasts.show({
        message,
        id: Toasts.genId(),
        type: toastType
    });
}

function getFollowIds(): string[] {
    return (settings.store.followUserIds || "")
        .split(",")
        .map(id => id.trim())
        .filter(Boolean);
}

function setFollowIds(ids: string[]) {
    settings.store.followUserIds = [
        ...new Set(ids)
    ].join(",");
}

function isFollowed(userId: string) {
    return getFollowIds().includes(userId);
}

function getCurrentFollowId(): string | null {
    const current = settings.store.currentFollowId;

    if (!current || !isFollowed(current)) {
        return null;
    }

    return current;
}

function setCurrentFollowId(userId: string | null) {
    settings.store.currentFollowId = userId ?? "";
    settings.store.followUserId = userId ?? "";
}

function isPaused() {
    return settings.store.paused === true;
}

function setPaused(
    value: boolean,
    showToast = true
) {
    settings.store.paused = value;

    if (showToast) {
        showMessage(
            value
                ? "⏸️ تم إيقاف الفولو مؤقتًا"
                : "▶️ تم تشغيل الفولو",
            value ? "info" : "success"
        );
    }
}

function getUserName(userId: string) {
    const user = UserStore.getUser(userId);

    return (
        user?.globalName ??
        user?.username ??
        userId
    );
}

/* ───────────────────────── Voice helpers ───────────────────────── */

function getChannelId(userId: string): string | null {
    try {
        const states =
            VoiceStateStore.getAllVoiceStates();

        for (const users of Object.values(states)) {
            const state = users?.[userId];

            if (state?.channelId) {
                return state.channelId;
            }
        }

        return (
            VoiceStateStore
                .getVoiceStateForUser?.(userId)
                ?.channelId ?? null
        );
    } catch {
        return null;
    }
}

function getMyChannelId(): string | null {
    try {
        return (
            SelectedChannelStore.getVoiceChannelId() ??
            null
        );
    } catch {
        return null;
    }
}

function isStreaming() {
    try {
        const user =
            UserStore.getCurrentUser();

        const state =
            VoiceStateStore
                .getVoiceStateForUser?.(user.id);

        return Boolean(
            state?.selfStream ||
            state?.selfVideo
        );
    } catch {
        return false;
    }
}

function canJoinChannel(channel: any) {
    try {
        return (
            channel?.type === 1 ||
            PermissionStore.can(
                CONNECT,
                channel
            ) ||
            PermissionStore.can(
                PermissionsBits.MOVE_MEMBERS,
                channel
            )
        );
    } catch {
        return false;
    }
}

function isChannelFull(
    channel: any,
    channelId: string
) {
    if (!settings.store.channelFull) {
        return false;
    }

    if (
        !channel?.userLimit ||
        channel.userLimit === 0
    ) {
        return false;
    }

    try {
        const states =
            VoiceStateStore
                .getVoiceStatesForChannel(
                    channelId
                );

        const count = states
            ? Object.keys(states).length
            : 0;

        const canMove =
            PermissionStore.can(
                PermissionsBits.MOVE_MEMBERS,
                channel
            );

        return (
            count >= channel.userLimit &&
            !canMove
        );
    } catch {
        return false;
    }
}

/* ───────────────────────── Follow logic ───────────────────────── */

function triggerFollow(
    channelOverride?: string | null,
    silent = false
) {
    const targetId =
        getCurrentFollowId();

    if (!targetId) {
        return;
    }

    const targetName =
        getUserName(targetId);

    const targetChannel =
        channelOverride === undefined
            ? getChannelId(targetId)
            : channelOverride;

    const myChannel =
        getMyChannelId();

    if (targetChannel) {
        if (targetChannel === myChannel) {
            if (!silent) {
                showMessage(
                    `😉 أنت أصلًا مع ${targetName} في نفس الروم`,
                    "info"
                );
            }

            return;
        }

        if (
            isStreaming() &&
            !settings.store.allowFollowWhileStreaming
        ) {
            showMessage(
                "🎥 الانتقال أثناء البث غير مفعّل من الإعدادات",
                "error"
            );

            return;
        }

        const channel =
            ChannelStore.getChannel(
                targetChannel
            );

        if (!channel) {
            showMessage(
                `⚠️ لم أستطع الحصول على بيانات روم ${targetName}`,
                "error"
            );

            return;
        }

        if (!canJoinChannel(channel)) {
            showMessage(
                `⚠️ لا تملك صلاحية دخول روم ${targetName}`,
                "error"
            );

            return;
        }

        if (
            isChannelFull(
                channel,
                targetChannel
            )
        ) {
            showMessage(
                `🔒 روم ${targetName} ممتلئ حاليًا`,
                "error"
            );

            return;
        }

        try {
            ChannelActions.selectVoiceChannel(
                targetChannel
            );

            if (!silent) {
                showMessage(
                    `🎧 تم الانتقال مع ${targetName}`,
                    "success"
                );
            }
        } catch {
            showMessage(
                "⚠️ حدث خطأ أثناء محاولة دخول الروم",
                "error"
            );
        }

        return;
    }

    if (
        myChannel &&
        settings.store.followLeave
    ) {
        try {
            ChannelActions.disconnect();

            if (!silent) {
                showMessage(
                    `👋 خرج ${targetName} وتم فصلك من الروم`,
                    "success"
                );
            }
        } catch {
            showMessage(
                "⚠️ حدث خطأ أثناء فصلك من الروم",
                "error"
            );
        }

        return;
    }

    if (!silent) {
        showMessage(
            myChannel
                ? `⚙️ خرج ${targetName}، وخيار الفصل التلقائي غير مفعّل`
                : `💤 ${targetName} ليس في روم صوتي حاليًا`,
            "info"
        );
    }
}

/* ───────────────────────── Follow actions ───────────────────────── */

function setFollow(
    userId: string,
    enable: boolean
) {
    const ids = getFollowIds();
    const name = getUserName(userId);

    if (enable) {
        if (!ids.includes(userId)) {
            ids.push(userId);
            setFollowIds(ids);

            showMessage(
                `✅ تمت إضافة ${name} إلى الفولو`,
                "success"
            );
        }

        setCurrentFollowId(userId);
        setPaused(false, false);

        return;
    }

    if (ids.includes(userId)) {
        setFollowIds(
            ids.filter(id => id !== userId)
        );

        showMessage(
            `❌ تمت إزالة ${name} من الفولو`,
            "info"
        );
    }

    const remaining =
        getFollowIds();

    if (
        getCurrentFollowId() === userId
    ) {
        setCurrentFollowId(
            remaining.at(-1) ?? null
        );

        setPaused(false, false);
    }
}

function togglePause() {
    const target =
        getCurrentFollowId();

    if (!target) {
        showMessage(
            "لا يوجد هدف فولو حالي",
            "info"
        );

        return;
    }

    const nextState =
        !isPaused();

    setPaused(nextState);

    if (!nextState) {
        triggerFollow();
    }
}

function confirmFollowAction(user: User) {
    const name =
        user.globalName ??
        user.username ??
        user.id;

    Alerts.show({
        title: "إعدادات الفولو",
        body:
            `${name} موجود في قائمة الفولو.\n` +
            "وش تبي تسوي ؟",
        confirmText: "بروح معه",
        cancelText: "إزالة الفولو",
        confirmColor: "green",

        onConfirm: () => {
            setCurrentFollowId(user.id);
            setPaused(false, false);
            triggerFollow();
        },

        onCancel: () => {
            setFollow(user.id, false);
        }
    });
}

/* ───────────────────────── Context menus ───────────────────────── */

interface UserContextProps {
    channel: Channel;
    guildId?: string;
    user: User;
}

const UserContext: NavContextMenuPatchCallback = (
    children,
    { user }: UserContextProps
) => {
    const currentUser =
        UserStore.getCurrentUser();

    if (
        !user ||
        !currentUser ||
        user.id === currentUser.id
    ) {
        return;
    }

    const followed =
        isFollowed(user.id);

    const item = (
        <Menu.MenuItem
            id="rvnn-follow-user"
            label={
                followed
                    ? "اكرهك"
                    : "احبك"
            }
            icon={
                followed
                    ? UnfollowIcon
                    : FollowIcon
            }
            action={() => {
                if (followed) {
                    confirmFollowAction(user);
                } else {
                    setFollow(user.id, true);

                    if (
                        settings.store.executeOnFollow
                    ) {
                        triggerFollow();
                    }
                }
            }}
        />
    );

    injectItem(
        children,
        item,
        USER_SECTION_LABEL,
        "fers-store-user-controls"
    );
};

const ChannelContext: NavContextMenuPatchCallback = (
    children,
    { channel }: { channel: Channel }
) => {
    if (
        !channel ||
        channel.type !== 2 ||
        !channel.guild_id
    ) {
        return;
    }

    const users = getFollowIds()
        .map(id => UserStore.getUser(id))
        .filter(
            (user): user is User =>
                Boolean(user)
        );

    const currentId =
        getCurrentFollowId();

    const currentName =
        currentId
            ? getUserName(currentId)
            : "لا يوجد";

    const entries: React.ReactElement[] = [
        <Menu.MenuItem
            key="rvnn-follow-current"
            id="rvnn-follow-current"
            label={
                `🎯 الهدف الحالي: ${currentName}`
            }
            disabled={true}
        />,

        <Menu.MenuItem
            key="rvnn-follow-status"
            id="rvnn-follow-status"
            label={
                isPaused()
                    ? "⏸️ الحالة: متوقف مؤقتًا"
                    : "▶️ الحالة: يعمل"
            }
            disabled={true}
        />,

        <Menu.MenuSeparator
            key="rvnn-follow-separator"
        />
    ];

    if (!users.length) {
        entries.push(
            <Menu.MenuItem
                key="rvnn-follow-empty"
                id="rvnn-follow-empty"
                label={
                    "لا يوجد مستخدمون في قائمة الفولو"
                }
                disabled={true}
            />
        );
    } else {
        entries.push(
            ...users.map(user => (
                <Menu.MenuItem
                    key={user.id}
                    id={
                        `rvnn-follow-entry-${user.id}`
                    }
                    label={
                        `${user.username}` +
                        (
                            user.id === currentId
                                ? " ✓"
                                : ""
                        )
                    }
                    action={() =>
                        confirmFollowAction(user)
                    }
                />
            ))
        );

        entries.push(
            <Menu.MenuSeparator
                key="rvnn-follow-separator-2"
            />
        );

        entries.push(
            <Menu.MenuItem
                key="rvnn-follow-pause"
                id="rvnn-follow-pause"
                label={
                    isPaused()
                        ? "▶️ تشغيل الفولو"
                        : "⏸️ إيقاف الفولو مؤقتًا"
                }
                disabled={!currentId}
                action={togglePause}
            />
        );

        entries.push(
            <Menu.MenuItem
                key="rvnn-follow-remove-all"
                id="rvnn-follow-remove-all"
                label="إزالة كل الفولو"
                color="danger"
                action={() => {
                    Alerts.show({
                        title:
                            "تأكيد إزالة كل الفولو",
                        body:
                            `هل تريد إزالة ${users.length} مستخدم من الفولو؟`,
                        confirmText: "إزالة الكل",
                        cancelText: "إلغاء",
                        confirmColor: "red",

                        onConfirm: () => {
                            setFollowIds([]);
                            setCurrentFollowId(null);
                            setPaused(false, false);

                            showMessage(
                                `تمت إزالة الفولو عن ${users.length} أشخاص`,
                                "info"
                            );
                        }
                    });
                }}
            />
        );
    }

    const listItem = (
        <Menu.MenuItem
            id="rvnn-follow-list"
            label={
                `📜 قائمة الفولو (${users.length})`
            }
        >
            {entries}
        </Menu.MenuItem>
    );

    injectItem(
        children,
        listItem,
        CHANNEL_SECTION_LABEL,
        "fers-store-channel-controls"
    );
};

/* ───────────────────────── Header button ───────────────────────── */

function FollowHeaderButton() {
    const {
        plugins: {
            "rvnn-follow-only": {
                followUserIds,
                currentFollowId,
                paused
            }
        }
    } = useSettings([
        "plugins.rvnn-follow-only.followUserIds",
        "plugins.rvnn-follow-only.currentFollowId",
        "plugins.rvnn-follow-only.paused"
    ]);

    const ids = (followUserIds || "")
        .split(",")
        .map(id => id.trim())
        .filter(Boolean);

    const current =
        currentFollowId || "";

    if (!ids.length || !current) {
        return null;
    }

    const name =
        getUserName(current);

    const isCurrentlyPaused =
        paused === true;

    const Icon =
        isCurrentlyPaused
            ? PausedIcon
            : FollowIcon;

    return (
        <HeaderBarButton
            icon={(props: any) => (
                <Icon
                    {...props}
                    width={20}
                    height={20}
                    style={{
                        ...(props?.style ?? {}),
                        color: isCurrentlyPaused
                            ? "var(--status-warning)"
                            : "var(--status-positive)"
                    }}
                />
            )}
            tooltip={
                isCurrentlyPaused
                    ? `فولو متوقف مؤقتًا: ${name}\nاضغط للتشغيل`
                    : `فولو يعمل: ${name}\nاضغط للإيقاف المؤقت`
            }
            onClick={(event: React.MouseEvent) => {
                event.preventDefault();
                togglePause();
            }}
            onContextMenu={(event: React.MouseEvent) => {
                event.preventDefault();
                setFollow(current, false);
            }}
        />
    );
}

/* ───────────────────────── Plugin ───────────────────────── */

export default definePlugin({
    name: "3nzyFollow",

    description:
        "Voice follow with a HeaderBar pause/resume button.",

    authors: [Devs.rz30, Devs.r,Devs.anzy,Devs.anzyh],
    settings,

    contextMenus: {
        "user-context": UserContext,
        "channel-context": ChannelContext
    },

    headerBarButton: {
        icon: FollowIcon,
        render: FollowHeaderButton,
        priority: 5
    },

    flux: {
        VOICE_STATE_UPDATES({
            voiceStates
        }: {
            voiceStates: VoiceState[];
        }) {
            const targetId =
                getCurrentFollowId();

            if (!targetId || isPaused()) {
                return;
            }

            const myId =
                UserStore.getCurrentUser()?.id;

            for (const state of voiceStates) {
                const {
                    userId,
                    channelId,
                    oldChannelId
                } = state;

                if (
                    channelId === oldChannelId
                ) {
                    continue;
                }

                const isMe =
                    userId === myId;

                if (
                    isMe &&
                    settings.store.autoMoveBack &&
                    channelId &&
                    oldChannelId
                ) {
                    triggerFollow(
                        undefined,
                        true
                    );

                    continue;
                }

                if (
                    isMe &&
                    settings.store.autoRejoin &&
                    !channelId &&
                    oldChannelId
                ) {
                    triggerFollow(
                        undefined,
                        true
                    );

                    continue;
                }

                if (
                    settings.store.onlyManualTrigger
                ) {
                    continue;
                }

                if (
                    settings.store.channelFull &&
                    !isMe &&
                    !channelId &&
                    oldChannelId
                ) {
                    const oldChannel =
                        ChannelStore.getChannel(
                            oldChannelId
                        );

                    if (
                        oldChannel?.userLimit &&
                        oldChannel.userLimit > 0
                    ) {
                        const members =
                            VoiceStateStore
                                .getVoiceStatesForChannel(
                                    oldChannelId
                                );

                        const count = members
                            ? Object.keys(members).length
                            : 0;

                        const targetStillThere =
                            Boolean(
                                members?.[targetId]
                                    ?.channelId ===
                                oldChannelId
                            );

                        if (
                            targetStillThere &&
                            count <
                                oldChannel.userLimit
                        ) {
                            triggerFollow(
                                oldChannelId,
                                true
                            );

                            continue;
                        }
                    }
                }

                if (userId !== targetId) {
                    continue;
                }

                if (channelId) {
                    triggerFollow(
                        channelId,
                        true
                    );
                } else if (oldChannelId) {
                    triggerFollow(
                        null,
                        true
                    );
                }
            }
        }
    },

    start() {
        const current =
            getCurrentFollowId();

        if (!current) {
            setCurrentFollowId(null);
            settings.store.paused = false;
        }
    },

    stop() {
        // يتم الاحتفاظ بقائمة الفولو في الإعدادات.
    }
});
