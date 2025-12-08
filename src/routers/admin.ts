import { Router } from "express";
import fs from "fs/promises";
import crypto from "crypto";
import checkAdminKey from "../middleware/checkAdminKey";
import { logger } from "../../lib/util";
import { queryOne, execute } from "../../lib/database";
import { User, Role } from "../../lib/types/loved-types";

const router = Router();
router.use(checkAdminKey);

// POST /admin/key
router.post("/key/:user", async (req, res) => {
    // Endpoint for allowing a specific token to
    // access every endpoint.
    const userId = parseInt(req.params.user);

    if (isNaN(userId)) {
        return res.status(400).json({ 
            success: false,
            message: "invalid user id parameter" 
        });
    }

    try {
        // Check if user exists in database
        const user = await queryOne<User>(
            "SELECT * FROM users WHERE id = ?",
            [userId]
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "user not found in database, they should login to the website first!"
            });
        }

        // Check if user already has a key
        const data = await fs.readFile("approved.json", "utf-8");
        const parsed = JSON.parse(data);

        if (Array.isArray(parsed.allowed)) {
            const existingKey = parsed.allowed.find((item: any) => 
                item.user?.id === userId || item.user === userId
            );

            if (existingKey) {
                return res.status(409).json({
                    success: false,
                    message: "user already has a key"
                });
            }
        }

        const addAllowedToken = async (userObj: User, isPrivileged: boolean = false) => {
            const token = crypto.randomBytes(48).toString('base64');

            if (!Array.isArray(parsed.allowed)) {
                parsed.allowed = [];
            }

            parsed.allowed.push({ key: token, user: userObj.id, privileged: isPrivileged });

            await fs.writeFile("./approved.json", JSON.stringify(parsed, null, 4), "utf-8");

            return token;
        };

        const token = await addAllowedToken(user, false);
        
        res.status(200).json({
            success: true,
            message: "Token successfully created",
            data: {
                user: {
                    id: user.id,
                    name: user.name
                },
                token,
                privileged: false
                // always false for now,
                // i'd rather manually create privileged tokens myself
            }
        });
    } catch (err) {
        logger.error(err, "error allowing token");

        res.status(500).json({
            success: false,
            message: "an internal server error has occured. if you see this, please ping yuki about it!",
            data: {
                error: err
            }
        });
    }
})

// POST /admin/grant/:user
router.post("/grant/:user", async (req, res) => {
    // Endpoint for granting admin role to an existing database user
    const user = parseInt(req.params.user);

    if (isNaN(user)) {
        return res.status(400).json({ 
            success: false,
            message: "invalid user id parameter" 
        });
    }

    try {
        const userExists = await queryOne<User>(
            "SELECT * FROM users WHERE id = ?",
            [user]
        );

        if (!userExists) {
            return res.status(404).json({
                success: false,
                message: "user not found in database, they should login to the website first!"
            });
        }

        await execute(
            "INSERT IGNORE INTO user_roles (role_id, user_id, game_mode, alumni) VALUES (?, ?, ?, ?)",
            [Role.admin, user, -1, false]
        );

        res.status(200).json({
            success: true,
            message: `Added ${userExists.name} [#${userExists.id}] as administrator`,
            data: {
                user: {
                    id: userExists.id,
                    name: userExists.name
                }
            }
        });
    } catch (err) {
        logger.error(err, "error granting admin role");
        
        res.status(500).json({
            success: false,
            message: "an internal server error has occurred. if you see this, please ping yuki about it!",
            data: {
                error: err
            }
        });
    }
});

export default router;