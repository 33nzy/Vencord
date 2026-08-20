/*
 * AutoMentionHomeTyping
 * Popup فوق للمنشن مع:
 * - قبول / رفض / تجاهل المستخدم
 * - لون / حجم / مدة / صوت / لا تزعج / scope / تجاهل بوتات ومستخدمين
 * - ترميز نوع المنشن (DM أو سيرفر/قناة)
 * - Cooldown per user
 * - VIP mode (منشن مهم فقط) من الإعدادات فقط
 * - ثيم مختلف للـ DM والسيرفرات
 */

import definePlugin, { OptionType } from "@utils/types";
import { Devs } from "@utils/constants";
import {
    ChannelRouter,
    FluxDispatcher,
    SelectedChannelStore,
    UserStore,
    ChannelStore,
    GuildStore
} from "@webpack/common";
import { definePluginSettings } from "@api/Settings";

interface MentionUser {
    userId: string;
    displayName: string;
    avatarUrl?: string;
    channelId: string;
    messageId: string;
    guildId?: string;
    contentSnippet?: string;
    locationLabel?: string;
}

type ScopeType = "all" | "dmsOnly" | "guildsOnly";

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "تفعيل إشعارات المنشن",
        default: true
    },
    position: {
        type: OptionType.SELECT,
        description: "مكان البوب أب",
        default: "top-right",
        options: [
            { label: "أعلى يمين", value: "top-right" },
            { label: "أعلى يسار", value: "top-left" },
            { label: "أسفل يمين", value: "bottom-right" },
            { label: "أسفل يسار", value: "bottom-left" }
        ]
    },
    maxNotifications: {
        type: OptionType.SLIDER,
        description: "أقصى عدد إشعارات تظهر في نفس الوقت",
        default: 3,
        min: 1,
        max: 5,
        step: 1,
        markers: [1, 2, 3, 4, 5]
    },
    dmBackgroundColor: {
        type: OptionType.STRING,
        description: "لون خلفية البوب أب في الخاص (hex بدون #)",
        default: "2b2d31"
    },
    guildBackgroundColor: {
        type: OptionType.STRING,
        description: "لون خلفية البوب أب في السيرفرات (hex بدون #)",
        default: "202225"
    },
    sizePercent: {
        type: OptionType.SLIDER,
        description: "حجم البوب أب (50% - 150%)",
        default: 100,
        min: 50,
        max: 150,
        step: 10,
        markers: [50, 75, 100, 125, 150]
    },
    autoHideSeconds: {
        type: OptionType.SLIDER,
        description: "مدة بقاء الإشعار (بالثواني، 0 = لا يختفي تلقائياً)",
        default: 5,
        min: 0,
        max: 20,
        step: 1,
        markers: [0, 5, 10, 15, 20]
    },
    showContentSnippet: {
        type: OptionType.BOOLEAN,
        description: "إظهار جزء من نص الرسالة تحت \"منشنك ...\"",
        default: true
    },
    snippetLength: {
        type: OptionType.SLIDER,
        description: "طول النص المعروض (عدد الحروف)",
        default: 40,
        min: 10,
        max: 100,
        step: 5,
        markers: [10, 25, 40, 60, 80, 100]
    },
    playSound: {
        type: OptionType.BOOLEAN,
        description: "تشغيل صوت بسيط عند ظهور إشعار منشن",
        default: true
    },
    doNotDisturb: {
        type: OptionType.BOOLEAN,
        description: "نمط لا تزعج (لا تظهر إشعارات المنشن)",
        default: false
    },
    ignoredUserIds: {
        type: OptionType.STRING,
        description: "IDs يتم تجاهل منشنهم (افصل بينها بفاصلة ,)",
        default: ""
    },
    ignoreBotsInDMs: {
        type: OptionType.BOOLEAN,
        description: "تجاهل منشن البوتات في الخاص فقط",
        default: true
    },
    ignoreBotsInGuilds: {
        type: OptionType.BOOLEAN,
        description: "تجاهل منشن البوتات في السيرفرات فقط",
        default: false
    },
    scope: {
        type: OptionType.SELECT,
        description: "نطاق الإشعارات (Scope)",
        default: "all",
        options: [
            { label: "الكل (خاص + سيرفرات)", value: "all" },
            { label: "الخاص فقط", value: "dmsOnly" },
            { label: "السيرفرات فقط", value: "guildsOnly" }
        ]
    },
    cooldownSeconds: {
        type: OptionType.SLIDER,
        description: "مدة الكول داون لكل مستخدم (ثواني، 0 = بدون كول داون)",
        default: 5,
        min: 0,
        max: 60,
        step: 5,
        markers: [0, 5, 10, 20, 40, 60]
    },
    vipModeEnabled: {
        type: OptionType.BOOLEAN,
        description: "تفعيل وضع \"منشن مهم فقط\" (VIP mode)",
        default: false
    },
    vipUserIds: {
        type: OptionType.STRING,
        description: "IDs للمستخدمين المهمين (VIP) (افصل بينها بفاصلة ,)",
        default: ""
    }
});

let notificationContainer: HTMLDivElement | null = null;
const lastNotifiedPerUser = new Map<string, number>();

function generateCss() {
    const scale = (settings.store.sizePercent || 100) / 100;

    return `
.vc-mentionhome-container {
    position: fixed;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: ${6 * scale}px;
}
.vc-mentionhome-container.top-right { top: 80px; right: 20px; }
.vc-mentionhome-container.top-left { top: 80px; left: 20px; }
.vc-mentionhome-container.bottom-right { bottom: 20px; right: 20px; }
.vc-mentionhome-container.bottom-left { bottom: 20px; left: 20px; }

.vc-mentionhome-popup {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    min-width: 260px;
    max-width: 360px;
    border: 1px solid var(--background-modifier-accent, #4f545c);
    border-radius: 8px;
    direction: rtl;
    transform-origin: top right;
    transform: scale(${scale});
}
.vc-mentionhome-container.top-left .vc-mentionhome-popup { transform-origin: top left; }
.vc-mentionhome-container.bottom-right .vc-mentionhome-popup { transform-origin: bottom right; }
.vc-mentionhome-container.bottom-left .vc-mentionhome-popup { transform-origin: bottom left; }

.vc-mentionhome-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.vc-mentionhome-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    flex-shrink: 0;
}

.vc-mentionhome-textwrap {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.vc-mentionhome-name {
    font-weight: 600;
    color: var(--text-normal, #fff);
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.vc-mentionhome-desc {
    font-size: 13px;
    color: var(--text-muted, #b9bbbe);
}

.vc-mentionhome-location {
    font-size: 12px;
    color: var(--text-muted, #b9bbbe);
}

.vc-mentionhome-snippet {
    font-size: 12px;
    color: var(--text-muted, #b9bbbe);
    margin-top: 2px;
    max-height: 40px;
    overflow: hidden;
    text-overflow: ellipsis;
}

.vc-mentionhome-buttons {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.vc-mentionhome-accept,
.vc-mentionhome-reject,
.vc-mentionhome-ignore {
    padding: 4px 8px;
    border-radius: 5px;
    border: none;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
}

.vc-mentionhome-accept {
    background: var(--status-success, #3ba55d);
    color: #fff;
}

.vc-mentionhome-reject {
    background: var(--status-danger, #ed4245);
    color: #fff;
}

.vc-mentionhome-ignore {
    background: var(--background-tertiary, #4f545c);
    color: var(--text-muted, #b9bbbe);
}
`;
}

function ensureStyles() {
    if (typeof document === "undefined") return;

    let style = document.getElementById("vc-mentionhome-css") as HTMLStyleElement | null;
    if (!style) {
        style = document.createElement("style");
        style.id = "vc-mentionhome-css";
        document.head.appendChild(style);
    }
    style.textContent = generateCss();
}

function createContainer() {
    if (notificationContainer) {
        updateContainerPosition();
        return;
    }
    if (typeof document === "undefined" || !document.body) return;

    notificationContainer = document.createElement("div");
    notificationContainer.className = `vc-mentionhome-container ${settings.store.position}`;
    document.body.appendChild(notificationContainer);
}

function updateContainerPosition() {
    if (!notificationContainer) return;
    notificationContainer.className = `vc-mentionhome-container ${settings.store.position}`;
}

function removeContainer() {
    notificationContainer?.remove();
    notificationContainer = null;
}

function parseIds(str: string): Set<string> {
    return new Set(
        (str || "")
            .split(",")
            .map(s => s.trim())
            .filter(Boolean)
    );
}

function parseIgnoredIds(): Set<string> {
    return parseIds(settings.store.ignoredUserIds);
}

function addIgnoredId(id: string) {
    const set = parseIgnoredIds();
    if (set.has(id)) return;
    set.add(id);
    settings.store.ignoredUserIds = Array.from(set).join(", ");
}

function parseVipIds(): Set<string> {
    return parseIds(settings.store.vipUserIds);
}

function isDirectMention(message: any) {
    const me = UserStore.getCurrentUser();
    if (!me || !message?.content) return false;
    if (message.author?.id === me.id) return false;

    const mentions = Array.isArray(message.mentions) ? message.mentions : [];
    return mentions.some((u: any) => u?.id === me.id);
}

function shouldIgnoreByScope(guildId?: string): boolean {
    const scope = settings.store.scope as ScopeType;
    const isDM = !guildId;
    if (scope === "all") return false;
    if (scope === "dmsOnly" && !isDM) return true;
    if (scope === "guildsOnly" && isDM) return true;
    return false;
}

function shouldIgnoreBot(author: any, guildId?: string) {
    const userStoreUser = UserStore.getUser(author.id);
    const isBot = userStoreUser?.bot || author.bot;
    if (!isBot) return false;

    const isDM = !guildId;
    if (isDM && settings.store.ignoreBotsInDMs) return true;
    if (!isDM && settings.store.ignoreBotsInGuilds) return true;

    return false;
}

function withinCooldown(userId: string): boolean {
    const cooldown = settings.store.cooldownSeconds || 0;
    if (cooldown <= 0) return false;

    const now = Date.now();
    const last = lastNotifiedPerUser.get(userId) || 0;
    if (now - last < cooldown * 1000) return true;

    lastNotifiedPerUser.set(userId, now);
    return false;
}

function buildLocationLabel(channelId: string, guildId?: string): string {
    try {
        if (!guildId) {
            return "في: الرسائل الخاصة";
        }
        const channel = ChannelStore.getChannel?.(channelId);
        const guild = GuildStore.getGuild?.(guildId);
        const channelName = channel?.name || "channel";
        const guildName = guild?.name || "سيرفر";
        return `في: #${channelName} — ${guildName}`;
    } catch {
        return guildId ? "في: سيرفر" : "في: الخاص";
    }
}

function getBackgroundColorForContext(guildId?: string): string {
    const isDM = !guildId;
    return isDM
        ? (settings.store.dmBackgroundColor || "2b2d31")
        : (settings.store.guildBackgroundColor || "202225");
}

function jumpToMessage(user: MentionUser) {
    try {
        (ChannelRouter as any).transitionToChannel(user.channelId, user.messageId);
    } catch {
        try {
            (ChannelRouter as any).transitionTo(
                `/channels/${user.guildId || "@me"}/${user.channelId}/${user.messageId}`
            );
        } catch (e) {
            console.error("[AutoMentionHomeTyping] jump error", e);
        }
    }
}

function playPingSound() {
    if (!settings.store.playSound) return;
    try {
        const audio = new Audio("https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg");
        audio.volume = 0.2;
        audio.play().catch(() => {});
    } catch {}
}

function stripDiscordMentions(text: string) {
    return text
        .replace(/<@!?\d+>/g, "")
        .replace(/<@&\d+>/g, "")
        .replace(/<#\d+>/g, "")
        .replace(/@everyone/g, "")
        .replace(/@here/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function createNotificationElement(user: MentionUser) {
    const notification = document.createElement("div");
    notification.className = "vc-mentionhome-popup";
    notification.dataset.messageId = user.messageId;

    const bg = getBackgroundColorForContext(user.guildId);
    notification.style.backgroundColor = `#${bg}`;

    const left = document.createElement("div");
    left.className = "vc-mentionhome-left";

    if (user.avatarUrl) {
        const avatar = document.createElement("img");
        avatar.className = "vc-mentionhome-avatar";
        avatar.src = user.avatarUrl;
        avatar.alt = user.displayName;
        left.appendChild(avatar);
    }

    const textWrap = document.createElement("div");
    textWrap.className = "vc-mentionhome-textwrap";

    const name = document.createElement("div");
    name.className = "vc-mentionhome-name";
    name.textContent = user.displayName;

    const desc = document.createElement("div");
    desc.className = "vc-mentionhome-desc";
    desc.textContent = "جاك منشن يالشيخ";

    textWrap.appendChild(name);
    textWrap.appendChild(desc);

    if (user.locationLabel) {
        const loc = document.createElement("div");
        loc.className = "vc-mentionhome-location";
        loc.textContent = user.locationLabel;
        textWrap.appendChild(loc);
    }

    if (settings.store.showContentSnippet && user.contentSnippet) {
        const snippet = document.createElement("div");
        snippet.className = "vc-mentionhome-snippet";
        snippet.textContent = user.contentSnippet;
        textWrap.appendChild(snippet);
    }

    left.appendChild(textWrap);

    const buttons = document.createElement("div");
    buttons.className = "vc-mentionhome-buttons";

    const acceptBtn = document.createElement("button");
    acceptBtn.className = "vc-mentionhome-accept";
    acceptBtn.textContent = "قبول";
    acceptBtn.onclick = () => {
        jumpToMessage(user);
        notification.remove();
    };

    const rejectBtn = document.createElement("button");
    rejectBtn.className = "vc-mentionhome-reject";
    rejectBtn.textContent = "رفض";
    rejectBtn.onclick = () => {
        notification.remove();
    };

    const ignoreBtn = document.createElement("button");
    ignoreBtn.className = "vc-mentionhome-ignore";
    ignoreBtn.textContent = "تجاهل المستخدم";
    ignoreBtn.onclick = () => {
        addIgnoredId(user.userId);
        notification.remove();
    };

    buttons.appendChild(acceptBtn);
    buttons.appendChild(rejectBtn);
    buttons.appendChild(ignoreBtn);

    notification.appendChild(left);
    notification.appendChild(buttons);

    const seconds = settings.store.autoHideSeconds;
    if (seconds > 0) {
        const timeout = setTimeout(() => {
            if (!notification.isConnected) return;
            notification.remove();
        }, seconds * 1000);

        const clear = () => clearTimeout(timeout);
        acceptBtn.addEventListener("click", clear);
        rejectBtn.addEventListener("click", clear);
        ignoreBtn.addEventListener("click", clear);
    }

    return notification;
}

function handleMention(message: any) {
    if (!settings.store.enabled) return;
    if (settings.store.doNotDisturb) return;
    if (!isDirectMention(message)) return;

    if (shouldIgnoreByScope(message.guild_id)) return;

    const currentChannelId = SelectedChannelStore.getChannelId?.();
    if (currentChannelId && currentChannelId === message.channel_id) return;

    const author = message.author;
    if (!author) return;

    const ignoredIds = parseIgnoredIds();
    if (ignoredIds.has(author.id)) return;

    if (shouldIgnoreBot(author, message.guild_id)) return;

    if (settings.store.vipModeEnabled) {
        const vipSet = parseVipIds();
        if (!vipSet.has(author.id)) return;
    }

    if (withinCooldown(author.id)) return;

    createContainer();
    if (!notificationContainer) return;

    const userStoreUser = UserStore.getUser(author.id);

    const displayName =
        userStoreUser?.globalName ||
        userStoreUser?.username ||
        author.username ||
        "مستخدم";

    let snippet: string | undefined;
    if (settings.store.showContentSnippet && typeof message.content === "string") {
        const maxLen = settings.store.snippetLength || 40;
        const cleaned = stripDiscordMentions(message.content);
        snippet = cleaned.length > maxLen ? cleaned.slice(0, maxLen) + "..." : cleaned;
    }

    const locationLabel = buildLocationLabel(message.channel_id, message.guild_id);

    const mentionUser: MentionUser = {
        userId: author.id,
        displayName,
        avatarUrl: userStoreUser?.getAvatarURL?.(undefined, 64, true),
        channelId: message.channel_id,
        messageId: message.id,
        guildId: message.guild_id,
        contentSnippet: snippet,
        locationLabel
    };

    const existing = Array.from(notificationContainer.children).some(
        (child: any) => (child as HTMLElement).dataset.messageId === mentionUser.messageId
    );
    if (existing) return;

    const el = createNotificationElement(mentionUser);
    notificationContainer.appendChild(el);

    while (notificationContainer.children.length > settings.store.maxNotifications) {
        notificationContainer.removeChild(notificationContainer.firstChild as ChildNode);
    }

    playPingSound();
}

const fluxHandler = ({ message }: { message: any }) => {
    try {
        if (!message) return;
        if (typeof document === "undefined") return;
        if (document.readyState === "loading") return;
        handleMention(message);
    } catch (e) {
        console.error("[AutoMentionHomeTyping] MESSAGE_CREATE error", e);
    }
};

export default definePlugin({
    name: "MentionTyping",
    description: "Popup فوق للمنشن مع VIP mode، ثيم DM/سيرفر، وتخصيص كامل.",
    authors: [Devs.anzyh,Devs.rz30,Devs.anzy,Devs.r],
    settings,

    start() {
        try {
            ensureStyles();
            createContainer();
            FluxDispatcher.subscribe("MESSAGE_CREATE", fluxHandler);
        } catch (e) {
            console.error("[AutoMentionHomeTyping] start error", e);
        }
        console.log("[AutoMentionHomeTyping] Started");
    },

    stop() {
        try {
            FluxDispatcher.unsubscribe("MESSAGE_CREATE", fluxHandler);
        } catch {}
        removeContainer();
        document.getElementById("vc-mentionhome-css")?.remove();
        console.log("[AutoMentionHomeTyping] Stopped");
    }
});
