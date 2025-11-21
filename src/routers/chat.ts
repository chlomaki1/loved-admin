import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler";
import { logger, getOsuApi, template, joinList } from "../../lib/util";
import { LovedAdmin } from "../../lib/loved";
import { Gamemode, getLongNameForGamemode } from "../../lib/types/osu-types";

const router = Router();

// POST /chat/messages
router.post(
    "/messages",
    asyncHandler(async (req, res) => {
        // Sends out consent messages to all users
        // whose beatmap has been nominated for loved.
        const osuApi = await getOsuApi();
        const roundData = await LovedAdmin.getRound(req.body.round_id);

        if (roundData.nominations.length === 0) {
            return res.status(400).json({ error: "No nominations found for this round." });
        }

        const alreadyHandledMapsets: number[] = [];

        // workflow:
        // * iterate through all nominations, collecting all nominations with the same beatmapset
        // * collect the creators of each beatmap in the beatmapset for the modes nominated
        // * send one message per beatmapset to all creators involved in the nominated set

        for (const nomination of roundData.nominations) {
            const beatmapsetId = nomination.beatmapset.id;
            
            if (alreadyHandledMapsets.includes(beatmapsetId)) {
                continue;
            }

            const relatedNominations = roundData.nominations.filter(n => n.beatmapset.id === beatmapsetId);
            const creatorsToNotify: number[] = [];
            const creatorNames: string[] = [];
            const modesNominated: Gamemode[] = [];
            const excludedDifficulties: number[] = [];

            for (const nom of relatedNominations) {
                if (!modesNominated.includes(nom.game_mode)) {
       
                    modesNominated.push(nom.game_mode);
                }

                for (const creator of nom.beatmapset_creators) {
                    if (creatorsToNotify.includes(creator.id)) {
                        continue;
                    }

                    creatorsToNotify.push(creator.id);
                    creatorNames.push(creator.name || "Unknown User");
                }

                for (const beatmap of nom.beatmaps) {
                    if (excludedDifficulties.includes(beatmap.id)) {
                        continue;
                    } else if (beatmap.excluded) {
                        excludedDifficulties.push(beatmap.id);
                    }
                }

            }

            // Variables to use for templating
            const beatmapset = nomination.beatmapset;

            console.log(await template("chat-nomination-template", {
                round: {
                    name: roundData.round.name
                },
                beatmapset: {
                    id: beatmapset.id,
                    excluded: excludedDifficulties,
                    artist: nomination.overwrite_artist || beatmapset?.artist || "Unknown Artist",
                    title: nomination.overwrite_title || beatmapset?.title || "Unknown Title",
                },
                metadata: {
                    gamemode_names: joinList(modesNominated.map(mode => getLongNameForGamemode(mode))),
                    gamemodes: modesNominated,
                    creator_names: joinList(creatorNames),
                    thresholds: modesNominated.map(mode => {
                        const gm = roundData.round?.game_modes?.[String(mode)];
                        return `${(gm?.voting_threshold ?? 0) * 100 || "N/A"}% for ${getLongNameForGamemode(mode)}`;
                    }).join("\n"),
                    poll_start_guess: req.body.poll_start_guess || "N/A"
                },
            }));

            alreadyHandledMapsets.push(beatmapsetId);
        }

        res.json({});
    })
)

export default router;