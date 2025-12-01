import { Router } from "express";
import fs from "fs/promises";
import crypto from "crypto";
import checkAdminKey from "../middleware/checkAdminKey";
import { logger } from "../../lib/util";

const router = Router();
router.use(checkAdminKey);

// POST /admin/allow
router.post("/allow", (req, res) => {
    // Endpoint for allowing a specific token to
    // access every endpoint.
    const { user } = req.body;

    if (!user || typeof user !== 'number') {
        return res.status(400).json({ message: "missing or invalid user id in body" });
    }

    const addAllowedToken = async (userId: number) => {
        const token = crypto.randomBytes(48).toString('base64');
        
        const data = await fs.readFile("approved.json", "utf-8");
        const parsed = JSON.parse(data);
        
        if (!Array.isArray(parsed.allowed)) {
            parsed.allowed = [];
        }

        parsed.allowed.push({ key: token, user: userId });

        await fs.writeFile("approved.json", JSON.stringify(parsed, null, 4), "utf-8");
        
        return token;
    };
    
    addAllowedToken(user).then((token) => {
        res.status(200).json({ message: "Token allowed successfully", user, token });
    }).catch((err) => {
        logger.error(err, "Error allowing token");
        res.status(500).json({ message: "Internal server error" });
    });
})

export default router;