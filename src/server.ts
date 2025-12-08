import express from "express";
import checkKey from "./middleware/checkKey";
import pinoHttp from "pino-http";
import { init, logger } from "../lib/util";
import pino from "pino";

// - ROUTERS
//import metaRouter from "./routers/meta";
import adminRouter from "./routers/admin";
import roundsRouter from "./routers/rounds";
import pollsRouter from "./routers/polls";
import nominationsRouter from "./routers/nominations";

// - APPLICATION
const server = express();

server.use(express.json());
server.use(express.urlencoded({ extended: true }));
server.use(pinoHttp({
    logger,
    customReceivedMessage: (req) => `Incoming request: ${req.method} ${req.url}`,
    customSuccessMessage: (req, res, responseTime) => `Request completed: ${req.method} ${req.url} - ${res.statusCode} in ${responseTime}ms`,
    customErrorMessage: (req, res, error) => `Request errored: ${req.method} ${req.url} - ${res.statusCode} - message: ${error.message}`,
    serializers: {
        req: pino.stdSerializers.wrapRequestSerializer((r) => {
            return {}
        }),
        res: pino.stdSerializers.wrapResponseSerializer((r) => {
            return {}
        })
    }
}));

// -PUBLIC ROUTERS
//server.use("/meta", metaRouter);

// - ROUTERS
server.use(checkKey);
server.use("/admin", adminRouter);
server.use("/rounds", roundsRouter);
server.use("/polls", pollsRouter);
server.use("/nominations", nominationsRouter);

// - START SERVER
server.listen(9500, () => {
    logger.info("Server is running on port 9500");

    init()
        .then(() => logger.info("Successfully initialized server state and data"))
})