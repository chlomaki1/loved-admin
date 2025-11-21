import { Beatmap, Beatmapset, Gamemode, UserSummary } from "./osu-types";

export enum CreatorState {
    Unchecked = 0,
    CheckedByCaptain = 1,
    Approved = 2
}

export interface LovedRoundResponse {
    discord_webhooks: string[];
    nominations: Nomination[];
    results_post_ids?: Record<string, number | null>;
    round: RoundMeta;
}

export interface Nomination {
    id: number;
    beatmapset_id: number;
    round_id: number;
    game_mode: Gamemode;
    difficulties_set: boolean;
    category: string | null;
    description: string | null;
    description_author_id?: number | null;
    description_state?: number;
    creators_state: CreatorState;
    metadata_state?: number;
    moderator_state?: number;
    order?: number;
    overwrite_artist?: string | null;
    overwrite_title?: string | null;
    parent_id?: number | null;
    beatmapset: Beatmapset;
    description_author?: UserSummary;
    poll?: Poll;
    beatmaps: Beatmap[];
    beatmapset_creators: UserSummary[];
    nominators: UserSummary[];
    metadata_assignees: UserSummary[];
    moderator_assignees: UserSummary[];
    news_editor_assignees: UserSummary[];
}

export interface Poll {
    beatmapset_id: number;
    ended_at?: string | null;
    game_mode: Gamemode;
    id: number;
    result_no?: number | null;
    result_yes?: number | null;
    round_id?: number;
    started_at?: string;
    topic_id?: number;
}

export interface GameModeSetting {
    round_id: number;
    game_mode: number;
    nominations_locked: boolean;
    pack_state: number;
    results_post_id?: number | null;
    video?: string | null;
    voting_threshold?: number;
}

export interface RoundMeta {
    id: number;
    done: boolean;
    ignore_creator_and_difficulty_checks: boolean;
    ignore_moderator_checks: boolean;
    ignore_news_editor_assignees: boolean;
    ignore_packs_checks: boolean;
    name: string;
    news_author_id?: number;
    news_intro?: string | null;
    news_intro_preview?: string | null;
    news_outro?: string | null;
    news_posted_at?: string | null;
    video?: string | null;
    news_author?: UserSummary;
    game_modes: Record<string, GameModeSetting>;
}