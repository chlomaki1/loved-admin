import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler";
import { LovedAdmin } from "../../lib/loved";
import { remove } from "../../lib/database";

const router = Router();
const CONSTRAINT_TABLES = [
    "nomination_assignees",
    "nomination_description_edits",
    "nomination_nominators",
    "nomination_excluded_beatmaps",
    "beatmapset_creators"
]

// DELETE /nominations/:id
router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
        const nomination = await LovedAdmin.getNomination(req.params.id);

        if (!nomination) {
            return res.status(422).json({
                success: false,
                message: "could not find nomination by this id"
            });
        }

        for (const table of CONSTRAINT_TABLES) {
            await remove(
                table,
                {
                    nomination_id: nomination.id
                }
            );
        }

        await remove(
            "polls",
            {
                beatmapset_id: nomination.beatmapset_id,
                round_id: nomination.round_id
            }
        );

        await remove(
            "nominations",
            {
                id: nomination.id
            }
        );

        return res.status(200).json({
            success: true
        })
    })
)

export default router;