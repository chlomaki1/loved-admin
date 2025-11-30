import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler";
import { escapeMarkdown, getOsuApi, joinList, template, unique } from "../../lib/util";
import configData from "../../config.json";
import { body, matchedData, validationResult } from "express-validator";
import { LovedAdmin } from "../../lib/loved";
import { Gamemode, getLongNameForGamemode } from "../../lib/types/osu-types";
import { join } from "path";
import { config } from "process";

const router = Router();

// POST /rounds/:roundId/messages
interface ChatMessageData {
    round_id: number,
    dry_run: boolean,
    poll_start_guess: string
}

router.post(
    "/:roundId/messages",
    [
        body("dry_run", "the `dry_run` parameter must be a boolean")
            .isBoolean()
            .optional()
            .default(false),
        body("poll_start_guess", "the `poll_start_guess` parameter must be a string")
            .isString()
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

        const osu = await getOsuApi();
        const data = matchedData<ChatMessageData>(req);
        const roundData = await LovedAdmin.getRound(req.params.roundId);

        if (roundData.nominations.length === 0) {
            return res.status(400).json({
                success: false,
                error: "no nominations were found for this round"
            });
        }

        const alreadyHandledMapsets: number[] = [];
        const messageTemplates = ["chat-nomination-template-one", "chat-nomination-template-two"];
        const messages = [];

        // workflow:
        // * iterate through all nominations, collecting all nominations with the same beatmapset
        // * collect the creators of each beatmap in the beatmapset for the modes nominated
        // * send one message per beatmapset to all creators involved in the nominated set

        for (const nomination of roundData.nominations) {
            const beatmapsetId = nomination.beatmapset.id;
            const messagesToSend: string[] = [];

            if (alreadyHandledMapsets.includes(beatmapsetId)) {
                continue;
            }

            const beatmapset = nomination.beatmapset;
            const relatedNominations = roundData.nominations.filter(n => n.beatmapset.id === beatmapsetId);
            const creatorsToNotify: number[] = [];
            const guestCreatorNames: string[] = [];
            const modesNominated: Gamemode[] = [];
            const excludedDifficulties: number[] = [];
            const excludedDifficultiesText: string[] = [];

            for (const nom of relatedNominations) {
                if (!modesNominated.includes(nom.game_mode)) {
                    modesNominated.push(nom.game_mode);
                }

                for (const creator of nom.beatmapset_creators) {
                    const creatorName = `[${escapeMarkdown(creator.name || "Unknown User")}](${configData.osu.url}/users/${creator.id})`;

                    if (creatorsToNotify.includes(creator.id)
                        || creator.banned
                        || creator.id >= 4294000000
                        || creator.id == beatmapset.creator_id) {
                        // filter banned, placeholder users 
                        // and also the host of the set
                        if (creator.banned) {
                            // include banned creators in the set
                            guestCreatorNames.push(creatorName);
                        }

                        continue;
                    }

                    creatorsToNotify.push(creator.id);
                    guestCreatorNames.push(creatorName);
                }

                for (const beatmap of nom.beatmaps) {
                    if (excludedDifficulties.includes(beatmap.id)) {
                        continue;
                    } else if (beatmap.excluded) {
                        excludedDifficulties.push(beatmap.id);
                        excludedDifficultiesText.join(`[${escapeMarkdown(beatmap.version)}]`)
                    }
                }
            }

            modesNominated.sort((a, b) => Number(a) - Number(b));
            guestCreatorNames.sort((a, b) => a.localeCompare(b));

            const thresholds = modesNominated.map(mode => {
                const gm = roundData.round?.game_modes?.[String(mode)];
                return `- ${(gm?.voting_threshold ?? 0) * 100 || "N/A"}% for ${getLongNameForGamemode(mode)}`;
            });

            for (const messageTemplate of messageTemplates) {
                messagesToSend.push(await template(messageTemplate, {
                    osu_url: configData.osu.url,
                    loved_url: configData.loved.url,
                    round: {
                        name: roundData.round.name
                    },
                    beatmapset: {
                        id: beatmapset.id,
                        excluded: excludedDifficultiesText,
                        excluded_text: joinList(excludedDifficultiesText),
                        artist: escapeMarkdown(nomination.overwrite_artist || beatmapset?.artist || "Unknown Artist"),
                        title: escapeMarkdown(nomination.overwrite_title || beatmapset?.title || "Unknown Title"),
                        creators: guestCreatorNames
                    },
                    metadata: {
                        author_id: roundData.round.news_author?.id ?? 0,
                        author_name: roundData.round.news_author?.name ?? "Unknown Author",
                        gamemode_names: joinList(modesNominated.map(mode => getLongNameForGamemode(mode))),
                        gamemodes: modesNominated,
                        creator_names: joinList(guestCreatorNames),
                        thresholds: thresholds.length > 1 ? thresholds.join("\n") : thresholds[0]?.slice(2,-1),
                        poll_start_guess: req.body.poll_start_guess || "at an unknown date"
                    },
                }))
            }

            if (!data.dry_run) {
                // send message to everybody involved
                const channel = await osu.createChatAnnouncementChannel({
                    name: "Project Loved nomination",
                    description: "Your map has been nominated for the next round of Project Loved!"
                }, unique([beatmapset.creator_id, ...creatorsToNotify, roundData.round.news_author_id!]), messagesToSend[0]!);

                await osu.sendChatMessage(
                    channel,
                    messagesToSend[1]!
                );
            }

            alreadyHandledMapsets.push(beatmapsetId);
            messages.push({
                id: nomination.id,
                beatmapset_id: beatmapsetId,
                messages: messagesToSend,
                recipients: unique([beatmapset.creator_id, ...creatorsToNotify, roundData.round.news_author_id!]),
            });
        }

        res.json({
            success: true,
            data: {
                messages
            }
        });
    })
)

export default router;