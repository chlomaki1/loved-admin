import type { NextFunction, Request, Response } from "express";
import keys from "../../approved.json";
import { getOsuApi, getPublicOsuApi } from "../../lib/util";
import { queryOne } from "../../lib/database";
import { LovedUser } from "../../lib/loved";
import { User } from "../../lib/types/loved-types";

export interface KeyData {
    key: string;
    user?: number;
    isAdmin: boolean;
}

export default function checkKey(req: Request, res: Response, next: NextFunction) {
    if (!req.headers["x-key"]) {
        return res.status(401).json({
            success: false,
            message: "are you waiting for something?",
            development: process.env.NODE_ENV === "development"
        });
    }

    const apiKey = req.headers["x-key"] as string;
    
    const allowedEntry = keys.allowed.find((item: any) => item.key === apiKey);
    if (!allowedEntry) {
        return res.status(403).json({
            success: false,
            message: "invalid key. perhaps you're waiting for someone to approve your access?"
        });
    }

    res.locals.keyData = { 
        key: apiKey, 
        user: allowedEntry.user, 
        isAdmin: allowedEntry.privileged || false 
    } as KeyData;
    next();
}

export function getKeyData(res: Response): KeyData | null {
    return res.locals.keyData ?? null;
}

export async function getCurrenetUser(res: Response) {
    const keyData = getKeyData(res);
    const osu = await getPublicOsuApi();

    const osuUser = keyData?.user
        ? await osu.getUser(keyData.user)
        : null;

    const dbUser = await queryOne<User>(
        "SELECT * FROM users WHERE id = ?",
        [ keyData?.user ]
    )

    if (!osuUser || !dbUser)
        return null;
    else 
        return new LovedUser(osuUser, dbUser)
}