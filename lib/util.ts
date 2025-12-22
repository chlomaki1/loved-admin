import type * as osu from "osu-api-v2-js";
import config from "../config.json";
import fs from 'fs/promises';
import { join } from 'path';
import pino from "pino";
import { UserSummary, Gamemode } from "./types/osu-types";
import { Nomination } from "./types/loved-types";

let osuApi: osu.API;
let publicOsuApi: osu.API;

export const logger = pino({
    transport: {
        target: "pino-pretty",
    }
})

export async function init() {
}

export async function getOsuApi() {
    const osu = await loadESMModule<typeof import("osu-api-v2-js")>("osu-api-v2-js");
    
    if (!osuApi) {
        osuApi = await osu.API.createAsync(config.bot.id, config.bot.secret, {
            // The scopes we need for Loved Admin operations, e.g forum management
            // I couldn't find another way to let the library know which scopes to request
            //
            // so i bruteforced it by abusing the fact its passing the "user" body param directly
            // @ts-ignore
            grant_type: "client_credentials",
            scope: "delegate chat.write chat.write_manage forum.write forum.write_manage group_permissions",
        }, {
            server: config.osu.url
        })

        // XD
        // @ts-ignore
        osuApi.refreshToken = async function () {
            const old_token = this.access_token;
            // @ts-ignore
            this.is_refreshing_token = true;

            try {
                // @ts-ignore
                await this.getAndSetToken({
                    client_id: this.client_id,
                    client_secret:this.client_secret,
                    grant_type: "client_credentials",
                    scope: "delegate chat.write chat.write_manage forum.write forum.write_manage group_permissions"
                }, this);
                if (old_token !== this.access_token) {
                // @ts-ignore
                    this.log(false, "The token has been refreshed!");
                }
            }
            catch (e) {
            // @ts-ignore
                this.log(true, "Failed to refresh the token :(", e);
            }
            finally {
            // @ts-ignore
                this.is_refreshing_token = false;
            }
            
            return old_token !== this.access_token;
        }
    }

    return osuApi;
}


export async function getPublicOsuApi() {
    const osu = await loadESMModule<typeof import("osu-api-v2-js")>("osu-api-v2-js");
    
    if (!publicOsuApi) {
        publicOsuApi = await osu.API.createAsync(config.bot.id, config.bot.secret, undefined, {
            server: config.osu.url
        })
    }

    return publicOsuApi;
}


export async function loadESMModule<T>(modulePath: string): Promise<T> {
    return await import(modulePath) as T;
}

export async function template(file: string, objectData: Record<string, any>): Promise<string> {
    const edge = await loadESMModule<typeof import("edge.js")>("edge.js");
    let content = await fs.readFile(join(__dirname, '..', 'templates', file + ".edge"), 'utf-8');

    return edge.default.renderRaw(
        content,
        objectData
    )
}

export function joinList(array: string[]): string {
	return array.length < 3
		? array.join(' and ')
		: array.slice(0, -1).join(', ') + ', and ' + array.at(-1);
}

export function escapeMarkdown(text: string) {
	return text
		.toString()
		.replace(/\\/g, '\\\\')
		.replace(/\*/g, '\\*')
		.replace(/\[(.+?)\]\(/g, '\\[$1\\](')
		.replace(/~/g, '\\~')
		.replace(/(\s|^|\[)_/g, '$1\\_')
		.replace(/_(\s|$|\])/g, '\\_$1')
		.replace(/(?<!\\)\[(.*?[^\\])\](?!\()/g, '\\[$1\\]');
}

export function formatUserUrltIncaseNonexistentUser(user: UserSummary) {
    return user.id >= 4294000000 ?
        escapeMarkdown(user.name ?? "Unknown Creator")
        : `[url=https://osu.ppy.sh/users/${user.id}]${escapeMarkdown(user.name ?? "Unknown Creator")}[/url]`
}

export function expandBbcodeRootLinks(text: string) {
	return text.toString().replace(/\[url=\/([^\]]+)\]/g, '[url=https://osu.ppy.sh/$1]');
}

export function expandNominationMetadata(nomination: Nomination): string {
    const relatedBeatmaps = nomination.beatmaps.filter((b) => b.game_mode == nomination.game_mode);
    const excluded = [];
    let info = "";

    for (const beatmap of relatedBeatmaps) {
        if (beatmap.excluded == true) {
            excluded.push(`[${beatmap.version}]`);
            continue;
        }
    }

    const maxBpm = maxOf(relatedBeatmaps, (b) => b.bpm ?? 0);
    const minBpm = minOf(relatedBeatmaps, (b) => b.bpm ?? 0);
    const longestBeatmap = maxOf(relatedBeatmaps, (b) => b.total_length ?? 0);

    if (minBpm == maxBpm) info += minBpm;
    else info += `${minBpm} - ${maxBpm}`;

    info += `BPM, ${formatDuration(longestBeatmap ?? 0)} | `;

    // star rating / key mode info
    if (relatedBeatmaps.length > 5) {
        const maxSr = maxOf(relatedBeatmaps, (b) => b.star_rating ?? 0) ?? 0;
        const minSr = minOf(relatedBeatmaps, (b) => b.star_rating ?? 0) ?? 0;

        if (nomination.game_mode === Gamemode.Mania) {
            const keyModes = [...new Set(relatedBeatmaps.map((bm) => bm.key_count))]
                .filter((k) => k != null)
                .sort((a: number, b: number) => a - b) as number[];

            info += keyModes.map((k) => `${k}K, `).join('');
        }

        info += `${minSr.toFixed(2)}★ – ${maxSr.toFixed(2)}★`;
    } else {
        info += relatedBeatmaps
            .map((beatmap) =>
                (beatmap.key_count == null ? '' : `[${beatmap.key_count}K] `) + `${(beatmap.star_rating ?? 0).toFixed(2)}★`,
            )
            .join(', ');
    }

    if (excluded.length > 0) {
        const part = `${joinList(excluded)} ${excluded.length > 1 ? "difficulties are " : "difficulty is"}`;

        info += shouldReverseExclude(relatedBeatmaps)
            ? `\nOnly the ${part} being nominated for Loved.`
            : `\nThe ${part} [i]not[/i] being nominated for Loved.`;
    }

    return info;
}

export function formatDuration(totalSeconds: number): string {
    const s = Math.floor(totalSeconds % 60);
    const m = Math.floor((totalSeconds / 60) % 60);
    const h = Math.floor(totalSeconds / 3600);

    const sec = s.toString().padStart(2, '0');
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec}`;
    if (m > 0) return `${m}:${sec}`;
    return `${sec}`;
}

export function unique<T>(items: T[]): T[] {
    return Array.from(new Set(items));
}

export function uniqueBy<T, K>(items: T[], keySelector: (item: T) => K): T[] {
    const seen = new Set<K>();
    const out: T[] = [];
    for (const it of items) {
        const k = keySelector(it);
        if (!seen.has(k)) {
            seen.add(k);
            out.push(it);
        }
    }
    return out;
}

export function shouldReverseExclude<T extends { excluded?: number | boolean }>(items: T[]): boolean {
    const len = items.length;
    if (len === 0) return false;

    const needed = Math.floor(len / 2) + 1; // need strictly more than half
    let count = 0;

    for (const it of items) {
        if (it.excluded) {
            count++;
            if (count >= needed) return true;
        }
    }

    return false;
}

export function maxOf<T>(items: T[], selector: (item: T) => number): number | null {
    if (items.length === 0) return null;
    return Math.max(...items.map(selector));
}

export function minOf<T>(items: T[], selector: (item: T) => number): number | null {
    if (items.length === 0) return null;
    return Math.min(...items.map(selector));
}