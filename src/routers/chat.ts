import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler";
import { logger, getOsuApi, template } from "../../lib/util";
import { LovedAdmin } from "../../lib/loved";

const router = Router();

// POST /chat/messages
router.post(
    "/messages",
    asyncHandler(async (req, res) => {
        // Sends out consent messages to all users
        // whose beatmap has been nominated for loved.
        const osuApi = await getOsuApi();
        const round = await LovedAdmin.getRound(req.body.round_id);

        if (round.nominations.length === 0) {
            return res.status(400).json({ error: "No nominations found for this round." });
        }

        // Variables to use for templating
        const beatmapset = round.nominations[0]?.beatmapset;

        console.log(await template("chat-nomination-template", {
            metadata: {
                artist: beatmapset?.artist || "Unknown Artist",
                title: beatmapset?.title || "Unknown Title",
            }
        }));

        res.json({});
    })
)

export default router;