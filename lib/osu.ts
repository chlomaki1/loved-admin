import { getOsuApi } from "./util";

export class OsuAPIExtra {
    static async pinThread(id: number, unpin: boolean = false) {
        const osu = await getOsuApi();

        return await osu.request("post", [ "forums", "topics", id, `pin?pin=${unpin ? "0" : "2"}` ])
    }

    static async lockThread(id: number) {
        const osu = await getOsuApi();

        return await osu.request("post", [ "forums", "topics", id, "lock?lock=1" ])
    }
}