import { Router } from "express";
import fs from "fs/promises";
import checkAdminKey from "../middleware/checkAdminKey";
import { logger } from "../../lib/util";

const router = Router();
router.use(checkAdminKey);

// POST /admin/allow
router.post("/allow", (req, res) => {
    // Endpoint for allowing a specific token to
    // access every endpoint.
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ error: "Missing token in body" });
    }

    const addAllowedToken = async (newToken: string) => {
        const data = await fs.readFile("approved.json", "utf-8");
        const parsed = JSON.parse(data);
        
        if (!Array.isArray(parsed.allowed)) {
            parsed.allowed = [];
        }

        parsed.allowed.push(newToken);

        await fs.writeFile("approved.json", JSON.stringify(parsed, null, 4), "utf-8");
    };
    
    addAllowedToken(token).then(() => {
        res.status(200).json({ message: "Token allowed successfully" });
    }).catch((err) => {
        logger.error(err, "Error allowing token");
        res.status(500).json({ error: "Internal server error" });
    });
})

export default router;