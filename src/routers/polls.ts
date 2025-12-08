import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler";
import { escapeMarkdown, expandBbcodeRootLinks, expandNominationMetadata, formatUserUrltIncaseNonexistentUser, getOsuApi, getPublicOsuApi, joinList, template, unique } from "../../lib/util";
import { LovedAdmin } from "../../lib/loved";
import configData from "../../config.json";
import { Gamemode, getApiNameForGamemode, getLongNameForGamemode, UserSummary } from "../../lib/types/osu-types";
import { OsuAPIExtra } from "../../lib/osu";
import { getMainThreadMeta, getMainThreadsForRound, setMainThreadMeta } from "../../lib/jsondb";
import { getCurrenetUser as getCurrentUser } from "../middleware/checkKey";
import { query } from "../../lib/database";
import { LogType, Poll } from "../../lib/types/loved-types";
import { body, matchedData, validationResult } from "express-validator";

const router = Router();

router.post(
    "/:roundId/start",
    [
        body("dry_run", "the `dry_run` parameter must be a boolean")
            .isBoolean()
            .optional()
            .default(false),
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(422).json({
                success: false,
                message: "one or more things are wrong with the body provided by this request",
                data: {
                    errors: errors.array()
                }
            });
        }

        const data = matchedData<{ dry_run?: boolean }>(req);
        const osu = await getOsuApi();
        const publicOsu = await getPublicOsuApi();
        const self = await getCurrentUser(res);
        const roundData = await LovedAdmin.getRound(req.params.roundId);

        const actions: any[] = [];

        // post it in reverse so that modes are sorted in-order
        for (const [_, value] of Object.entries(Gamemode).reverse()) {
            const mode = value as Gamemode;

            if (getLongNameForGamemode(mode) == undefined) {
                // the number keys return undefined, so its best to ignore them
                continue;
            }

            const nominations = roundData.nominations.filter(n => n.game_mode == mode);
            if (nominations.length === 0) {
                continue;
            }

            const childThreadBodies = [];
            const nominators: UserSummary[] = [];
            const threshold = (roundData.round.game_modes[String(mode)]?.voting_threshold ?? 0) * 100
            const childThreadIds: Record<number, number> = {};
            let anyChildUpdated = false;
            const existingPolls = await query<Poll>(
                "SELECT * FROM polls WHERE round_id = ? AND game_mode = ?",
                [
                    roundData.round.id,
                    mode
                ]
            )

            for (const nomination of nominations) {
                for (const nominator of nomination.nominators) {
                    if (nominators.find(nm => nm.id == nominator.id)) {
                        continue;
                    }

                    nominators.push(nominator);
                }

                childThreadBodies.push({
                    id: nomination.id,
                    artist: nomination.overwrite_artist ?? nomination.beatmapset.artist,
                    title: nomination.overwrite_title ?? nomination.beatmapset.title,
                    nomination: nomination,
                    body: {
                        author: nomination.description_author?.name || "Unknown Captain",
                        author_id: nomination.description_author?.id || 0,
                        link_mode: getApiNameForGamemode(mode),
                        main_thread_title: `[${getLongNameForGamemode(mode)}] Project Loved: ${roundData.round.name}`,
                        description: expandBbcodeRootLinks(nomination.description || "No description provided"),
                        captains: (joinList(nomination.nominators.map((n => `[url=${configData.osu.url}/users/${n.id}]${n.name}[/url]`)))),
                        beatmapset: {
                            id: nomination.beatmapset_id,
                            creators: joinList(nomination.beatmapset_creators.map((c) =>
                                formatUserUrltIncaseNonexistentUser(c))),
                            song: `${nomination.overwrite_artist || nomination.beatmapset.artist} - ${nomination.overwrite_title || nomination.beatmapset.title}`,
                            extra_metadata: expandNominationMetadata(nomination)
                        }
                    }
                });
            }

            // reuse the same main thread if we already have metadata stored,
            // otherwise create and store it
            let mainThread: any;
            const stored = await getMainThreadMeta(roundData.round.id, Number(mode));
            if (stored && stored.topic_id && stored.post_id) {
                mainThread = { topic: { id: stored.topic_id }, post: stored.post_id };
            } else {
                const mainThreadContent = await template("forum-main-thread", {
                    osu_url: configData.osu.url,
                    loved_url: configData.loved.url,
                    link_name: getApiNameForGamemode(mode),
                    last_results_post_id: roundData.results_post_ids?.[mode],
                    threshold: `${threshold || "N/A"}%`,
                    captains: joinList(nominators.map((nm) => `[url=${configData.osu.url}/users/${nm.id}]${nm.name}[/url]`)),
                    beatmapsets: nominations.map((n) => {
                        return {
                            id: n.beatmapset_id,
                            creators: joinList(n.beatmapset_creators.map((c) =>
                                formatUserUrltIncaseNonexistentUser(c))),
                            song: `${n.overwrite_artist || n.beatmapset.artist} - ${n.overwrite_title || n.beatmapset.title}`
                        }
                    })
                });

                if (!data.dry_run) {
                    const created = await osu.createForumTopic(
                        configData.osu.forumId,
                        `[${getLongNameForGamemode(mode)}] Project Loved: ${roundData.round.name}`,
                        mainThreadContent
                    );

                    mainThread = created;
                    // store main thread metadata for future runs
                    try {
                        await setMainThreadMeta(roundData.round.id, Number(mode), { topic_id: created.topic.id, post_id: (created.post?.id ?? created.post) as number });
                    } catch (e) {
                        // non-fatal: continue without persistence if writing fails
                        console.warn('Failed to persist main thread metadata', e);
                    }
                } else {
                    actions.push({
                        type: 'forum.createTopic',
                        data: {
                            forum_id: configData.osu.forumId,
                            title: `[${getLongNameForGamemode(mode)}] Project Loved: ${roundData.round.name}`,
                            content: mainThreadContent
                        },
                        metadata: {
                            mode,
                            round_id: roundData.round.id,
                            is_main_thread: true
                        }
                    });
                    
                    // simulate main thread for dry run
                    mainThread = { topic: { id: -1 }, post: -1 };
                }
            }

            for (const nominationPost of childThreadBodies) {
                // try to find an existing poll for this nomination
                // update existing posts if anything's potentially changed
                const existing = existingPolls.find(p => p.beatmapset_id === nominationPost.nomination.beatmapset_id);

                const rendered = (await template("forum-child-thread", {
                    osu_url: configData.osu.url,
                    loved_url: configData.loved.url,
                    round_name: `[${getLongNameForGamemode(mode)}] Project Loved: ${roundData.round.name}`,
                    ...nominationPost.body
                })).replace("((###MAIN_THREAD_ID_HERE###))", `${mainThread.topic.id}`);

                if (existing && existing.topic_id) {
                    // update existing thread/post instead of creating a new one
                    const existingThread = await publicOsu.getForumTopic(existing.topic_id)

                    if (!data.dry_run) {
                        try {
                            console.log(nominationPost)
                            // attempt to edit the existing post/topic
                            // note: osu API client expects a post id for editing; stored value is topic_id
                            // we try using the stored topic id which should work for updating the first post
                            await osu.editForumPost(existingThread.posts[0]?.id!, rendered);
                            await osu.editForumTopicTitle(existingThread.topic.id,
                                `[${getLongNameForGamemode(mode)}] ${nominationPost.artist} - ${nominationPost.title}`)
                            anyChildUpdated = true;
                        } catch (err) {
                            // if editing failed, don't create a new thread--just tank the loss
                            // and say we failed to update it
                            return res.status(500).json({
                                success: false,
                                message: "an internal server error prevented threads from being updated. if you see this, please ping yuki about it!",
                                data: {
                                    error: err
                                }
                            })
                        }
                    } else {
                        actions.push({
                            type: 'forum.editPost',
                            data: {
                                post_id: existingThread.posts[0]?.id!,
                                content: rendered
                            },
                            metadata: {
                                nomination_id: nominationPost.id,
                                beatmapset_id: nominationPost.nomination.beatmapset_id,
                                mode
                            }
                        });

                        actions.push({
                            type: 'forum.editTopicTitle',
                            data: {
                                topic_id: existingThread.topic.id,
                                title: `[${getLongNameForGamemode(mode)}] ${nominationPost.artist} - ${nominationPost.title}`
                            },
                            metadata: {
                                nomination_id: nominationPost.id,
                                mode
                            }
                        });
                        anyChildUpdated = true;
                    }

                    // reuse existing topic id
                    childThreadIds[nominationPost.id] = existing.topic_id;
                } else if (existing && !existing.topic_id) {
                    // found a DB record but no topic id stored - treat as no existing thread
                    // fall through to create new thread and update DB below
                    if (!data.dry_run) {
                        const thread = await osu.createForumTopic(
                            configData.osu.forumId,
                            `[${getLongNameForGamemode(mode)}] ${nominationPost.artist} - ${nominationPost.title}`,
                            rendered,
                            {
                                hide_results: true,
                                length_days: 10,
                                vote_change: true,
                                options: ["Yes", "No"],
                                title: `Should ${nominationPost.artist} - ${nominationPost.title} be Loved?`,
                                max_options: 1
                            }
                        );

                        await query("UPDATE polls SET topic_id = ? WHERE beatmapset_id = ? AND round_id = ?", [
                            thread.topic.id,
                            nominationPost.nomination.beatmapset_id,
                            roundData.round.id
                        ]);

                        childThreadIds[nominationPost.id] = thread.topic.id;
                    } else {
                        actions.push({
                            type: 'forum.createTopic',
                            data: {
                                forum_id: configData.osu.forumId,
                                title: `[${getLongNameForGamemode(mode)}] ${nominationPost.artist} - ${nominationPost.title}`,
                                content: rendered,
                                poll: {
                                    hide_results: true,
                                    length_days: 10,
                                    vote_change: true,
                                    options: ["Yes", "No"],
                                    title: `Should ${nominationPost.artist} - ${nominationPost.title} be Loved?`,
                                    max_options: 1
                                }
                            },
                            metadata: {
                                nomination_id: nominationPost.id,
                                beatmapset_id: nominationPost.nomination.beatmapset_id,
                                mode
                            }
                        });
                        actions.push({
                            type: 'database.query',
                            data: {
                                sql: 'UPDATE polls SET topic_id = ? WHERE beatmapset_id = ? AND round_id = ?',
                                params: [null, nominationPost.nomination.beatmapset_id, roundData.round.id]
                            },
                            metadata: {
                                beatmapset_id: nominationPost.nomination.beatmapset_id
                            }
                        });
                        childThreadIds[nominationPost.id] = -1;
                    }
                    anyChildUpdated = true;
                } else {
                    // no existing poll -> create thread and poll as before
                    if (!data.dry_run) {
                        const thread = await osu.createForumTopic(
                            configData.osu.forumId,
                            `[${getLongNameForGamemode(mode)}] ${nominationPost.artist} - ${nominationPost.title}`,
                            rendered,
                            {
                                hide_results: true,
                                length_days: 10,
                                vote_change: true,
                                options: ["Yes", "No"],
                                title: `Should ${nominationPost.artist} - ${nominationPost.title} be Loved?`,
                                max_options: 1
                            }
                        )

                        childThreadIds[nominationPost.id] = thread.topic.id;

                        // create poll for the nomination
                        await LovedAdmin.createPoll(
                            self!,
                            // @ts-ignore // this is probably fine
                            roundData.round,
                            nominationPost.nomination,
                            thread.topic
                        );
                    } else {
                        actions.push({
                            type: 'forum.createTopic',
                            data: {
                                forum_id: configData.osu.forumId,
                                title: `[${getLongNameForGamemode(mode)}] ${nominationPost.artist} - ${nominationPost.title}`,
                                content: rendered,
                                poll: {
                                    hide_results: true,
                                    length_days: 10,
                                    vote_change: true,
                                    options: ["Yes", "No"],
                                    title: `Should ${nominationPost.artist} - ${nominationPost.title} be Loved?`,
                                    max_options: 1
                                }
                            },
                            metadata: {
                                nomination_id: nominationPost.id,
                                beatmapset_id: nominationPost.nomination.beatmapset_id,
                                mode
                            }
                        });
                        actions.push({
                            type: 'database.createPoll',
                            data: {
                                round: roundData.round,
                                nomination: nominationPost.nomination,
                                topic_id: null
                            },
                            metadata: {
                                nomination_id: nominationPost.id,
                                mode
                            }
                        });
                        childThreadIds[nominationPost.id] = -1;
                    }
                    anyChildUpdated = true;
                }
            }

            // modify the main thread after every nomination has been posted
            // pin it at the same time
            if (!data.dry_run) {
                await OsuAPIExtra.pinThread(mainThread.topic.id);
            } else {
                actions.push({
                    type: 'forum.pinThread',
                    data: {
                        topic_id: mainThread.topic.id,
                        pin: true
                    },
                    metadata: { mode, is_main_thread: true }
                });
            }

            if (anyChildUpdated) {
                const mainThreadWithLinks = await template("forum-main-thread-with-child-links", {
                    osu_url: configData.osu.url,
                    loved_url: configData.loved.url,
                    link_name: getApiNameForGamemode(mode),
                    last_results_post_id: roundData.results_post_ids?.[mode],
                    threshold: `${threshold || "N/A"}%`,
                    captains: joinList(nominators.map((nm) => `[url=${configData.osu.url}/users/${nm.id}]${nm.name}[/url]`)),
                    beatmapsets: nominations.map((n) => {
                        return {
                            id: n.beatmapset_id,
                            creators: joinList(n.beatmapset_creators.map((c) =>
                                formatUserUrltIncaseNonexistentUser(c))),
                            song: `${n.overwrite_artist || n.beatmapset.artist} - ${n.overwrite_title || n.beatmapset.title}`,
                            thread_id: childThreadIds[n.id]
                        }
                    })
                });

                if (!data.dry_run) {
                    await osu.editForumPost(
                        mainThread.post,
                        mainThreadWithLinks
                    );
                } else {
                    actions.push({
                        type: 'forum.editPost',
                        data: {
                            post_id: mainThread.post,
                            content: mainThreadWithLinks
                        },
                        metadata: {
                            mode,
                            is_main_thread: true,
                            child_count: nominations.length
                        }
                    });
                }
            }
        }

        res.status(200).json({
            success: true,
            data: {
                actions: data.dry_run ? actions : undefined
            }
        })
    })
)

router.post(
    "/:roundId/end/forum",
    [
        body("dry_run", "the `dry_run` parameter must be a boolean")
            .isBoolean()
            .optional()
            .default(false),
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(422).json({
                success: false,
                message: "one or more things are wrong with the body provided by this request",
                data: {
                    errors: errors.array()
                }
            });
        }

        const data = matchedData<{ dry_run?: boolean }>(req);
        const self = await getCurrentUser(res);
        const osu = await getOsuApi();
        const publicOsu = await getPublicOsuApi();
        const now = new Date();
        const roundData = await LovedAdmin.getRound(req.params.roundId);

        // process forum results
        // then post them on the main threads for the round
        const results = [];
        const actions: any[] = [];

        for (const nomination of roundData.nominations) {
            if (req.query.force == "1") {
                // this is a means to force an end to a round's polls,
                // ignoring whatever the end date is

                // note: this only works if you have direct access to
                // the osu!web instance--because even if you try to run
                // this, it'll still just get stuck at "unexpected" poll
                // data
                if (nomination.poll == null) {
                    return res.status(422).json({
                        success: false,
                        message: "a nomination is missing a poll, thus this round cannot be forcibly closed"
                    });
                }
            } else {
                if (nomination.poll == null || new Date(nomination.poll.ended_at!) > now) {
                    return res.status(422).json({
                        success: false,
                        message: "polls for this round are not yet complete"
                    });
                } else if (nomination.poll.result_no != null || nomination.poll.result_yes != null) {
                    return res.status(422).json({
                        success: false,
                        message: "poll results have already been processed and stored on the forum"
                    });
                }
            }

            const thread = await publicOsu.getForumTopic(nomination.poll.topic_id!);

            if (
                thread.topic.poll == null
                || thread.topic.poll.options.length != 2
                || thread.topic.poll.options[0]?.text.bbcode != "Yes"
                || thread.topic.poll.options[1]?.text.bbcode != "No"
                || thread.topic.poll.options[0]?.vote_count == null
                || thread.topic.poll.options[1]?.vote_count == null
            ) {
                return res.status(422).json({
                    success: false,
                    message: "unexpected topic poll data encountered for nomination #" + nomination.id,
                    data: {
                        thread
                    }
                });
            }

            const poll = thread.topic.poll!;
            const yesVotes = poll.options[0]?.vote_count ?? 0;
            const noVotes = poll.options[1]?.vote_count ?? 0;
            const threshold = roundData.round.game_modes[String(nomination.game_mode)]?.voting_threshold ?? 0;

            results.push({
                nomination,
                poll: nomination.poll!,
                game_mode: getApiNameForGamemode(nomination.game_mode),
                artist: nomination.overwrite_artist ?? nomination.beatmapset.artist,
                title: nomination.overwrite_title ?? nomination.beatmapset.title,
                beatmapset: nomination.beatmapset,
                thread,
                creators: joinList(nomination.beatmapset_creators.map((c) =>
                    c.id >= 4294000000
                        ? c.name ?? "Unknown Creator"
                        : `[url=${configData.osu.url}/users/${c.id}]${c.name}[/url]`
                )),
                data: {
                    yes_votes: yesVotes,
                    no_votes: noVotes,
                    ratio: yesVotes / (noVotes + yesVotes),
                    ratio_text: ((yesVotes / (noVotes + yesVotes)) * 100) + "%",
                    passed: (yesVotes / (noVotes + yesVotes)) >= threshold
                }
            });
        }

        // post it in reverse so that modes are sorted in-order
        for (const [_, value] of Object.entries(Gamemode).reverse()) {
            const mode = value as Gamemode;

            if (getLongNameForGamemode(mode) == undefined) {
                // the number keys return undefined, so its best to ignore them
                continue;
            }

            const mainThread = await getMainThreadMeta(roundData.round.id, mode);
            const modeResults = results.filter(r => r.nomination.game_mode == mode);
            const threshold = (roundData.round.game_modes[String(mode)]?.voting_threshold ?? 0) * 100;

            if (modeResults.length == 0) {
                continue;
            }

            const passed = modeResults.filter((m) => m.data.passed == true);
            const failed = modeResults.filter((m) => m.data.passed == false);
            const resultPostContent = await template("forum-results-post", {
                osu_url: configData.osu.url,
                loved_url: configData.loved.url,
                impossible: (passed.length == 0) && (failed.length == 0),
                passed,
                failed,
                metadata: {
                    threshold: `${threshold || "N/A"}%`,
                }
            });

            let resultPost: any = null;
            if (!data.dry_run) {
                resultPost = await osu.replyForumTopic(
                    mainThread.topic_id,
                    resultPostContent
                );
            } else {
                actions.push({
                    type: 'forum.replyTopic',
                    data: {
                        topic_id: mainThread.topic_id,
                        content: resultPostContent
                    },
                    metadata: {
                        mode,
                        mainThread
                    }
                });
            }

            for (const result of modeResults) {
                const nomination = result.nomination;
                const replyMessage = result.data.passed
                    ? "This map passed the voting! It will be moved to Loved soon."
                    : "This map did not pass the voting.";

                if (!data.dry_run) {
                    await osu.replyForumTopic(
                        result.thread.topic,
                        replyMessage
                    );

                    await query(
                        `
                            UPDATE polls
                            SET 
                                result_yes = ?,
                                result_no = ?
                            WHERE id = ?
                        `,
                        [result.data.yes_votes, result.data.no_votes, result.poll.id]
                    );

                    await OsuAPIExtra.lockThread(result.thread.topic.id);
                    await LovedAdmin.log(
                        LogType.pollUpdated,
                        {
                            actor: self!.toLogUser(),
                            beatmapset: {
                                artist: nomination.overwrite_artist ?? nomination.beatmapset.artist,
                                id: nomination.beatmapset_id,
                                title: nomination.overwrite_title ?? nomination.beatmapset.title,
                            },
                            gameMode: nomination.game_mode,
                            poll: {
                                id: result.poll.id,
                                topic_id: result.thread.topic.id,
                            },
                            round: {
                                id: nomination.round_id,
                                name: roundData.round.name
                            }
                        }
                    );
                } else {
                    actions.push({
                        type: 'forum.replyTopic',
                        data: {
                            topic_id: result.thread.topic.id,
                            content: replyMessage
                        },
                        metadata: {
                            nomination_id: nomination.id,
                            beatmapset_id: nomination.beatmapset_id,
                            passed: result.data.passed
                        }
                    });
                    actions.push({
                        type: 'database.query',
                        data: {
                            sql: 'UPDATE polls SET result_yes = ?, result_no = ? WHERE id = ?',
                            params: [result.data.yes_votes, result.data.no_votes, result.poll.id]
                        },
                        metadata: {
                            poll_id: result.poll.id,
                            yes_votes: result.data.yes_votes,
                            no_votes: result.data.no_votes
                        }
                    });
                    actions.push({
                        type: 'forum.lockThread',
                        data: {
                            topic_id: result.thread.topic.id
                        },
                        metadata: {
                            nomination_id: nomination.id
                        }
                    });
                    actions.push({
                        type: 'log.pollUpdated',
                        data: {
                            actor: self!.toLogUser(),
                            beatmapset: {
                                artist: nomination.overwrite_artist ?? nomination.beatmapset.artist,
                                id: nomination.beatmapset_id,
                                title: nomination.overwrite_title ?? nomination.beatmapset.title,
                            },
                            gameMode: nomination.game_mode,
                            poll: {
                                id: result.poll.id,
                                topic_id: result.thread.topic.id,
                            },
                            round: {
                                id: nomination.round_id,
                                name: roundData.round.name
                            }
                        },
                        metadata: {}
                    });
                }
            }

            if (!data.dry_run) {
                await OsuAPIExtra.pinThread(mainThread.topic_id, true);
                await OsuAPIExtra.lockThread(mainThread.topic_id);

                await query(
                    `
                        UPDATE round_game_modes
                        SET results_post_id = ?
                        WHERE
                            round_id = ?
                            AND game_mode = ?
                    `,
                    [resultPost.id, roundData.round.id, mode]
                );
            } else {
                actions.push({
                    type: 'forum.pinThread',
                    data: {
                        topic_id: mainThread.topic_id,
                        pin: false
                    },
                    metadata: { mode }
                });
                actions.push({
                    type: 'forum.lockThread',
                    data: {
                        topic_id: mainThread.topic_id
                    },
                    metadata: { mode }
                });
                actions.push({
                    type: 'database.query',
                    data: {
                        sql: 'UPDATE round_game_modes SET results_post_id = ? WHERE round_id = ? AND game_mode = ?',
                        params: [null, roundData.round.id, mode]
                    },
                    metadata: {
                        mode,
                        round_id: roundData.round.id
                    }
                });
            }
        }

        return res.status(200).json({
            success: true,
            data: {
                results,
                actions: data.dry_run ? actions : undefined
            }
        })
    })
);

router.post(
    "/:roundId/end/chat",
    [
        body("dry_run", "the `dry_run` parameter must be a boolean")
            .isBoolean()
            .optional()
            .default(false),
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(422).json({
                success: false,
                message: "one or more things are wrong with the body provided by this request",
                data: {
                    errors: errors.array()
                }
            });
        }

        const data = matchedData<{ dry_run?: boolean }>(req);

        const self = await getCurrentUser(res);
        const osu = await getOsuApi();
        const now = new Date();
        const roundData = await LovedAdmin.getRound(req.params.roundId);

        // validate that all polls are complete and have results
        for (const nomination of roundData.nominations) {
            if (req.query.force == "1") {
                // this is a means to force an end to a round's polls,
                // ignoring whatever the end date is

                // note: this only works if you have direct access to
                // the osu!web instance--because even if you try to run
                // this, it'll still just get stuck at "unexpected" poll
                // data
                if (nomination.poll == null) {
                    return res.status(422).json({
                        success: false,
                        message: "a nomination is missing a poll, thus this round cannot be forcibly closed"
                    });
                }
            } else if (nomination.poll == null || new Date(nomination.poll.ended_at!) > now) {
                return res.status(422).json({
                    success: false,
                    message: "polls for this round are not yet complete"
                });
            }
        }

        // build results array with vote counts and pass/fail status
        const results = [];
        const passedCreatorIds: number[] = [];

        for (const nomination of roundData.nominations) {
            const poll = nomination.poll!;
            const threshold = roundData.round.game_modes[String(nomination.game_mode)]?.voting_threshold ?? 0;
            const yesVotes = poll.result_yes ?? 0;
            const noVotes = poll.result_no ?? 0;
            const totalVotes = yesVotes + noVotes;
            const passed = totalVotes > 0 && (yesVotes / totalVotes) >= threshold;

            results.push({
                nomination,
                passed,
                yes_votes: yesVotes,
                no_votes: noVotes
            });

            if (passed) {
                // collect all creators involved in this nomination
                passedCreatorIds.push(nomination.beatmapset.creator_id);
                for (const creator of nomination.beatmapset_creators) {
                    if (!creator.banned && creator.id < 4294000000) {
                        passedCreatorIds.push(creator.id);
                    }
                }
            }
        }

        // send chat announcement to all creators whose nominations passed
        const uniqueCreatorIds = unique([ ...passedCreatorIds, roundData.round.news_author_id! ]);
        const message = "Congratulations, your map passed voting in the last round of Project Loved! It will be moved to the Loved category soon.";
        const actions: any[] = [];

        if (uniqueCreatorIds.length > 0) {
            if (!data.dry_run) {
                await osu.createChatAnnouncementChannel({
                    name: "Project Loved Result",
                    description: "Your map passed Loved voting!"
                }, uniqueCreatorIds, message);
            } else {
                actions.push({
                    type: 'chat.createAnnouncementChannel',
                    data: {
                        channel: {
                            name: "Project Loved Result",
                            description: "Your map passed Loved voting!"
                        },
                        recipients: uniqueCreatorIds,
                        message: message
                    },
                    metadata: {
                        passed_count: results.filter(r => r.passed).length,
                        total_count: results.length
                    }
                });
            }
        }

        return res.status(200).json({
            success: true,
            data: {
                message: {
                    recipients: uniqueCreatorIds,
                    content: message
                },
                actions: data.dry_run ? actions : undefined
            }
        })
    })
);
export default router;