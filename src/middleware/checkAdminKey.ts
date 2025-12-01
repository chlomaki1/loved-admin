import type { NextFunction, Request, Response } from "express";
import keys from "../../approved.json";

export default function checkAdminKey(req: Request, res: Response, next: NextFunction) {
    if (!req.headers["x-key"]) {
        return res.status(401).json({
            success: false,
            error: "are you waiting for something?"
        });
    }

    if (req.headers["x-key"] !== keys.adminKey) {
        return res.status(403).json({
            success: false,
            error: "invalid key. perhaps you're waiting for someone to approve your access?"
        });
    }

    next();
}