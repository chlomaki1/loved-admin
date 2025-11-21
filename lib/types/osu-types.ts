export enum Gamemode {
    Standard,
    Taiko,
    Catch,
    Mania
}

export enum RankedStatus {
    Graveyard = -2,
    WorkInProgress = -1,
    Pending = 0,
    Ranked = 1,
    Approved = 2,
    Qualified = 3,
    Loved = 4
}


export interface Beatmapset {
    api_fetched_at: string;
    artist: string;
    creator_id: number;
    creator_name?: string;
    deleted_at?: string | null;
    favorite_count?: number;
    id: number;
    play_count?: number;
    ranked_status?: number;
    submitted_at?: string;
    title?: string;
    updated_at?: string;
}

export interface Beatmap {
    excluded: number;
    beatmapset_id: number;
    bpm?: number;
    creator_id?: number;
    deleted_at?: string | null;
    game_mode: Gamemode;
    id: number;
    key_count?: number | null;
    play_count?: number;
    ranked_status?: number;
    star_rating?: number;
    total_length?: number;
    version?: string;
}

export interface UserSummary {
    api_fetched_at?: string;
    avatar_url?: string;
    banned?: boolean;
    country?: string;
    id: number;
    name?: string;
}

export function getLongNameForGamemode(mode: Gamemode): string {
    switch (mode) {
        case Gamemode.Standard:
            return "osu!";
        case Gamemode.Taiko:
            return "osu!taiko";
        case Gamemode.Catch:
            return "osu!catch";
        case Gamemode.Mania:
            return "osu!mania";
    }
}