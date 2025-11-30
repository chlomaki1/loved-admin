import configData from "../config.json";
import { insert, queryOne } from "./database";
import { Beatmapset, ConsentValue, LogType, LovedError, LovedRoundResponse, Nomination, Poll, Review, Round, Submission, User, UserRole } from "./types/loved-types";
import { Gamemode } from "./types/osu-types";
import type { Forum, User as OsuUser } from "osu-api-v2-js";

type LogBeatmapset = Pick<Beatmapset, 'artist' | 'id' | 'title'>;
type LogReview = Pick<Review, 'game_mode' | 'id' | 'reason' | 'score'>;
type LogSubmission = Pick<Submission, 'game_mode' | 'id' | 'reason'>;
type LogUser = Pick<User, 'banned' | 'country' | 'id' | 'name'>;

interface LogValues {
    [LogType.apiServerStarted]: undefined;
    [LogType.loggedIn]: { user: LogUser };
    [LogType.loggedOut]: { user: LogUser };
    [LogType.userCreated]: { user: LogUser };
    [LogType.userUpdated]: { from: LogUser; to: LogUser };
    [LogType.roleCreated]: { actor: LogUser; role: Omit<UserRole, 'user_id'>; user: LogUser };
    [LogType.roleDeleted]: { actor: LogUser; role: Omit<UserRole, 'user_id'>; user: LogUser };
    [LogType.roleToggledAlumni]: { actor: LogUser; role: Omit<UserRole, 'user_id'>; user: LogUser };
    [LogType.mapperConsentCreated]: {
        actor: LogUser;
        consent: ConsentValue | null;
        reason: string | null;
        user: LogUser;
    };
    [LogType.mapperConsentUpdated]: {
        actor: LogUser;
        from: {
            consent: ConsentValue | null;
            reason: string | null;
        };
        to: {
            consent: ConsentValue | null;
            reason: string | null;
        };
        user: LogUser;
    };
    [LogType.mapperConsentBeatmapsetCreated]: {
        actor: LogUser;
        beatmapset: LogBeatmapset;
        consent: boolean;
        reason: string | null;
        user: LogUser;
    };
    [LogType.mapperConsentBeatmapsetDeleted]: {
        actor: LogUser;
        beatmapset: LogBeatmapset;
        user: LogUser;
    } & (
        | {
            consent: boolean;
            reason: string | null;
        }
        | {
            // deprecated
            consent: undefined;
            reason: undefined;
        }
    );
    [LogType.mapperConsentBeatmapsetUpdated]: {
        actor: LogUser;
        beatmapset: LogBeatmapset;
        from: {
            consent: boolean;
            reason: string | null;
        };
        to: {
            consent: boolean;
            reason: string | null;
        };
        user: LogUser;
    };
    [LogType.settingUpdated]: { actor: LogUser; setting: string };
    [LogType.extraTokenCreated]: { scopes: string[]; user: LogUser };
    [LogType.extraTokenDeleted]: {
        actor: LogUser | undefined;
        scopes: string[] | undefined; // undefined is deprecated
        user: LogUser;
    };
    [LogType.pollCreated]: {
        actor: LogUser;
        beatmapset: LogBeatmapset;
        gameMode: Gamemode;
        poll: Pick<Poll, 'id' | 'topic_id'>;
        round: Pick<Round, 'id' | 'name'>;
    };
    [LogType.pollUpdated]: {
        actor: LogUser;
        beatmapset: LogBeatmapset;
        gameMode: Gamemode;
        poll: Pick<Poll, 'id' | 'topic_id'>;
        round: Pick<Round, 'id' | 'name'>;
    };
    [LogType.submissionDeleted]: {
        actor: LogUser;
        beatmapset: LogBeatmapset;
        submission: LogSubmission;
        user: LogUser | undefined;
    };
    [LogType.reviewCreated]: {
        beatmapset: LogBeatmapset;
        review: LogReview;
        user: LogUser;
    };
    [LogType.reviewDeleted]: {
        actor: LogUser;
        beatmapset: LogBeatmapset;
        review: LogReview;
        user: LogUser;
    };
    [LogType.reviewUpdated]: {
        beatmapset: LogBeatmapset;
        from: LogReview;
        to: LogReview;
        user: LogUser;
    };
    [LogType.beatmapsetCreated]: { beatmapset: LogBeatmapset };
    [LogType.beatmapsetDeleted]: {
        actor: LogUser;
        beatmapset: LogBeatmapset;
    };
    [LogType.beatmapsetSoftDeleted]: { beatmapset: LogBeatmapset };
    [LogType.apiUpdateForced]: {
        actor: LogUser;
        objectId: number;
        objectType: string;
    };
}

export class LovedAdmin {
    static LOVED_URL = `${configData.loved.url}/api`;

    static async getRound(roundId: number): Promise<LovedRoundResponse> {
        const res = await fetch(`${LovedAdmin.LOVED_URL}/local-interop/data?roundId=${roundId}`, {
            headers: {
                "X-Loved-InteropKey": configData.loved.key,
                "X-Loved-InteropVersion": "8" // Has to be kept in sync with the server
            }
        })

        if (!res.ok) {
            throw new LovedError(res.status, `Failed to fetch round data`, await res.json())
        }

        return await res.json();
    }

    static async getNomination(nominationId: number): Promise<any | undefined> { // temp any because i cbf to type it
        return await queryOne("SELECT * FROM nominations WHERE id = ?", [nominationId]);
    }

    static async createPoll(user: LovedUser, round: Round, nomination: Nomination, topic: Forum.Topic): Promise<number> {
        const insertId = await insert(
            "polls",
            {
                beatmapset_id: nomination.beatmapset.id,
                ended_at: topic.poll!.ended_at,
                game_mode: nomination.game_mode,
                round_id: nomination.round_id,
                started_at: topic.poll!.started_at,
                topic_id: topic.id
            }
        );

        await this.log(
            LogType.pollCreated,
            {
                actor: user.toLogUser(),
                beatmapset: {
                  artist: nomination.overwrite_artist ?? nomination.beatmapset.artist,
                  id: nomination.beatmapset_id,
                  title: nomination.overwrite_title ?? nomination.beatmapset.title,
                },
                gameMode: nomination.game_mode,
                poll: {
                  id: insertId,
                  topic_id: topic.id,
                },
                round: {
                    id: nomination.round_id,
                    name: round.name
                }
            }
        );

        return insertId;
    }

    static async log<T extends LogType>(
        type: T,
        values: LogValues[T]
    ): Promise<void> {
        await insert(
            "logs",
            {
                type,
                created_at: new Date(),
                values: values == null ? null : JSON.stringify(values)
            }
        )
    }
}

export class LovedUser {
    self: OsuUser.Extended;
    dbSelf: User;

    constructor(user: OsuUser.Extended, dbUser: User) {
        this.self = user;
        this.dbSelf = dbUser;
    }

    toLogUser(): LogUser {
        return {
            id: this.self.id,
            name: this.dbSelf.name, // use db name to keep it consistent
            banned: this.dbSelf.banned,
            country: this.dbSelf.country,
        }
    }
}