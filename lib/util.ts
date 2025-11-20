import type * as osu from "osu-api-v2-js";
import config from "../config.json";
import fs from 'fs/promises';
import { join } from 'path';
import pino from "pino";

let osuApi: osu.API;

export const logger = pino({
    transport: {
        target: "pino-pretty",
    }
})

export async function getOsuApi() {
    const osu = await loadESMModule<typeof import("osu-api-v2-js")>("osu-api-v2-js");
    
    if (!osuApi) {
        osuApi = await osu.API.createAsync(config.bot.id, config.bot.secret, {
            // The scopes we need for Loved Admin operations, e.g forum management
            // I couldn't find another way to let the library know which scopes to request
            //
            // so i bruteforced it by abusing the fact its passing the "user" body param directly
            // @ts-ignore
            grant_type: "client_credentials",
            scope: "delegate forum.write_manage group_permissions"
        })

        // This also needs to be overridden to make sure the correct scopes are requested
        // I could've just implemented this myself rather than bruteforcing a library but
        // this was significantly funnier

        // @ts-ignore
        osuApi.refreshToken = async () => {
            logger.debug("Refreshing osu!api token using client_credentials grant");

            // @ts-ignore
            osuApi.getAndSetToken({
                client_id: osuApi.client_id,
                client_secret: osuApi.client_secret,
                grant_type: "client_credentials",
                scope: "delegate forum.write_manage group_permissions"
            }, osuApi);
        };
    }

    return osuApi;
}

export async function loadESMModule<T>(modulePath: string): Promise<T> {
    return await import(modulePath) as T;
}

export async function template(file: string, objectData: Record<string, any>): Promise<string> {
    let content = await fs.readFile(join(__dirname, '..', 'templates', file + ".md"), 'utf-8');

    return content
        .replace(/<\?([^>]+)>/g, (_, expression: string) => {
            // evaluate the expression
            let data: any = { ...objectData }; // make data available in eval scope
            return eval(`${expression}`);
        })
        .replace(/<=([^>]+)>/g, (_, key: string) => {
            console.log(key);
            const keys = key.trim().split('.');
            let value: any = objectData;

            for (const k of keys) {
                value = value?.[k];
                
                if (value === undefined || value === null) {
                    return '';
                }
            }
        
            return value;
        });
}