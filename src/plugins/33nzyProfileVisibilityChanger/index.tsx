import definePlugin, { OptionType } from "@utils/types";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { Button, Forms } from "@webpack/common";

const settings = definePluginSettings({
    visibilityLevel: {
        type: OptionType.SELECT,
        description: "من يمكنه رؤية ملفك الشخصي؟",
        options: [
            { label: "الأصدقاء فقط 🔒", value: 1, default: true },
            { label: "الأصدقاء والسيرفرات الصغيرة 👥", value: 2 },
            { label: "العام للجميع 🌍", value: 3 },
        ],
    },
    applyButton: {
        type: OptionType.COMPONENT,
        description: "تطبيق إعداد الخصوصية على الحساب فعليًا",
        component: () => <ApplyPrivacyComponent />,
    },
});

async function runProfileVisibilityHack(val: number) {
    const labels: Record<number, string> = {
        1: "الأصدقاء فقط 🔒",
        2: "الأصدقاء والسيرفرات الصغيرة 👥",
        3: "العام للجميع 🌍",
    };

    const req = await new Promise<any>(r => {
        const c =
            Object.keys(window).find(
                k => k.startsWith("webpackChunk") && Array.isArray((window as any)[k])
            ) || "webpackChunkdiscordapp";

        ((window as any)[c] ??= []).push([[Math.random()], {}, r]);
        (window as any)[c].pop();
    });

    let hit: [string, string] | null = null;

    for (const [id, fn] of Object.entries(req.m ?? {})) {
        const s = (fn as any).toString();

        if (!s.includes("profileVisibility")) continue;

        const v =
            s.match(
                /(?:^|[;,])\s*(?:let|const|var)?\s*([A-Za-z_$][\w$]*)\s*=\s*[A-Za-z_$][\w$]*\s*\(\s*["']privacy["']\s*,\s*["']profileVisibility["']/
            )?.[1];

        const e =
            v &&
            s.match(
                new RegExp(
                    `([A-Za-z_$][\\w$]*)\\s*:\\s*\\(\\)\\s*=>\\s*${v}\\b`
                )
            )?.[1];

        if (e) {
            hit = [id, e];
            break;
        }
    }

    const setting = hit && req(hit[0])?.[hit[1]];

    if (!setting?.updateSetting) {
        console.error("ProfileVisibilityChanger: profileVisibility not found.", { hit });
        return;
    }

    console.log("ProfileVisibilityChanger: Before:", setting.getSetting());
    await setting.updateSetting(val);
    setTimeout(
        () =>
            console.log(
                `ProfileVisibilityChanger: After (${labels[val] ?? val})`,
                setting.getSetting()
            ),
        1000
    );
}

function ApplyPrivacyComponent() {
    settings.use(["visibilityLevel"]);

    return (
        <div>
            <Forms.FormTitle tag="h5">تطبيق إعداد الخصوصية</Forms.FormTitle>
            <Forms.FormText style={{ marginBottom: 8 }}>
                يطبّق الإعداد الحالي (أصدقاء / أصدقاء + سيرفرات صغيرة / عام) على حسابك.
            </Forms.FormText>
            <Button
                color={Button.Colors.BRAND}
                onClick={async () => {
                    const val = settings.store.visibilityLevel ?? 1;
                    console.log("ProfileVisibilityChanger: Apply button clicked →", val);
                    await runProfileVisibilityHack(val);
                }}
            >
                تطبيق الآن
            </Button>
        </div>
    );
}

export default definePlugin({
    name: "ProfileVisibilityChanger",
    description: "بلوقن كامل لتعديل Profile Privacy باستخدام سكربت profileVisibility.",
    tags: ["Profile", "Privacy"],
    authors: [Devs.anzyh,Devs.rz30,Devs.anzy,Devs.r],
    requiresRestart: false,
    settings,

    start() {
        console.log("ProfileVisibilityChanger started", settings.store);
        settings.use(["visibilityLevel"]);
        // ما نلمس الإعداد تلقائيًا، نخلي التطبيق يدوي عن طريق الزر.
    },

    stop() {
        console.log("ProfileVisibilityChanger stopped.");
    },
});
