import type { NextFunction, Request, Response } from "express";
import keys from "../../approved.json";

export default function checkAdminKey(req: Request, res: Response, next: NextFunction) {
    if (!req.headers["x-key"]) {
        return res.status(401).json({
            success: false,
            message: "are you waiting for something?"
        });
    }

    const apiKey = req.headers["x-key"] as string;
    const allowedEntry = keys.allowed.find((item: any) => item.key === apiKey);
    
    if (!allowedEntry || !allowedEntry.privileged) {
        return res.status(403).json({
            success: false,
            message: "invalid key. perhaps you're waiting for someone to approve your access?"
        });
    }

    next();
}