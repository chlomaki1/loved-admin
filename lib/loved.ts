import configData from "../config.json";
import { LovedRoundResponse } from "./types/loved-types";

export class LovedAdmin {
    static async getRound(roundId: number): Promise<LovedRoundResponse> {
        const res = await fetch(`https://loved.sh/api/local-interop/data?roundId=${roundId}`, {
            headers: {
                "X-Loved-InteropKey": configData.lovedApiKey,
                "X-Loved-InteropVersion": "8" // Has to be kept in sync with the server
            }
        })

        if (!res.ok) {
            throw new Error(`Failed to fetch round data: ${res.status} ${res.statusText}`);
        }

        return await res.json();
    }
}