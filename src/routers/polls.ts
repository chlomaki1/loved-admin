import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler";
import { escapeMarkdown, expandBbcodeRootLinks, expandNominationMetadata, formatUserUrltIncaseNonexistentUser, getOsuApi, joinList, template } from "../../lib/util";
import { LovedAdmin } from "../../lib/loved";
import configData from "../../config.json";
import { Gamemode, getApiNameForGamemode, getLongNameForGamemode, UserSummary } from "../../lib/types/osu-types";
import { OsuAPIExtra } from "../../lib/osu";
import { config } from "process";
import { getCurrenetUser as getCurrentUser } from "../middleware/checkKey";
import { truncate } from "fs";

const router = Router();

router.post(
    "/:roundId/start",
    asyncHandler(async (req, res) => {
        const osu = await getOsuApi();
        const self = await getCurrentUser(res);
        const roundData = await LovedAdmin.getRound(req.params.roundId);

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

            const mainThreads = [];
            const childThreadBodies = [];
            const nominators: UserSummary[] = [];
            const threshold = (roundData.round.game_modes[String(mode)]?.voting_threshold ?? 0) * 100
            const childThreadIds: Record<number, number> = {};

            for (const nomination of nominations) {
                for (const nominator of nomination.nominators) {
                    if (nominators.find(nm => nm.id == nominator.id)) {
                        continue;
                    }

                    nominators.push(nominator);
                }

                childThreadBodies.push({
                    id: nomination.id,
                    artist: nomination.overwrite_artist || nomination.beatmapset.artist,
                    title: nomination.overwrite_title || nomination.beatmapset.title,
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
                            song: `${escapeMarkdown(nomination.overwrite_artist || nomination.beatmapset.artist)} - ${escapeMarkdown(nomination.overwrite_title || nomination.beatmapset.title)}`,
                            extra_metadata: expandNominationMetadata(nomination)
                        }
                    }
                });
            }

            const mainThread = await osu.createForumTopic(
                configData.osu.forumId,
                `[${getLongNameForGamemode(mode)}] Project Loved: ${roundData.round.name}`,
                await template("forum-main-thread", {
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
                            song: `${escapeMarkdown(n.overwrite_artist || n.beatmapset.artist)} - ${escapeMarkdown(n.overwrite_title || n.beatmapset.title)}`
                        }
                    })
                })
            )

            for (const nominationPost of childThreadBodies) {
                const thread = await osu.createForumTopic(
                    configData.osu.forumId,
                    `[${getLongNameForGamemode(mode)}] ${nominationPost.artist} - ${nominationPost.title}`,
                    (await template("forum-child-thread", {
                        osu_url: configData.osu.url,
                        loved_url: configData.loved.url,
                        round_name: `[${getLongNameForGamemode(mode)}] Project Loved: ${roundData.round.name}`,
                        ...nominationPost.body
                    }))
                    .replace("((###MAIN_THREAD_ID_HERE###))", `${mainThread.topic.id}`), // i hate typescript
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
                LovedAdmin.createPoll(
                    self!,
                    // @ts-ignore // this is probably fine
                    roundData.round,
                    nominationPost.nomination,
                    thread.topic
                );
            }

            // modify the main thread after every nomination has been posted
            // also pin it at the same time
            await OsuAPIExtra.pinThread(mainThread.topic.id);
            await osu.editForumPost(
                mainThread.post,
                await template("forum-main-thread-with-child-links", {
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
                            song: `${escapeMarkdown(n.overwrite_artist || n.beatmapset.artist)} - ${escapeMarkdown(n.overwrite_title || n.beatmapset.title)}`,
                            thread_id: childThreadIds[n.id]
                        }
                    })
                })
            )
        }

        res.status(200).json({
            success: true
        })
    })
)

export default router;