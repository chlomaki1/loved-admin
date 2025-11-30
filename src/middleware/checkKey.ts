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
        return res.status(401).json({ error: "Missing key" });
    }

    const apiKey = req.headers["x-key"] as string;
    
    if (apiKey === keys.adminKey) {
        res.locals.keyData = { key: apiKey, user: keys.adminId, isAdmin: true } as KeyData;
        return next();
    }

    const allowedEntry = keys.allowed.find((item: any) => item.key === apiKey);
    if (!allowedEntry) {
        return res.status(403).json({ error: "Invalid key" });
    }

    res.locals.keyData = { key: apiKey, user: allowedEntry.user, isAdmin: false } as KeyData;
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