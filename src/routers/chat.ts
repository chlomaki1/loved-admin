import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler";
import { getOsuApi } from "../../lib/util";
import { body, matchedData, validationResult } from "express-validator";

const router = Router();

// POST /chat/messages
interface ChatMessageData {
    targets: number[],
    message: string,
    channel: {
        name: string;
        description: string
    }
}

router.post(
    "/messages",
    [
        body("targets", "the provided target users must be an array of user ids")
            .isArray()
            .isNumeric(),
        body("message", "a message must be provided").isString(),
        body("channel.name", "a channel name must be provided").isString(),
        body("channel.description", " a channel description must be provided").isString()
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

        await osu.createChatAnnouncementChannel({
            name: data.channel.name,
            description: data.channel.description
        }, data.targets, data.message);

        return res.status(200).json({
            success: true
        })
    })
)

export default router;