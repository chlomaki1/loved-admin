import express from "express";
import checkKey from "./middleware/checkKey";
import pinoHttp from "pino-http";
import { logger } from "../lib/util";
import pino from "pino";

// - ROUTERS
import adminRouter from "./routers/admin";
import chatRouter from "./routers/chat";

// - APPLICATION
const server = express();

server.use(express.json());
server.use(express.urlencoded({ extended: true }));
server.use(pinoHttp({
    logger,
    customReceivedMessage: (req) => `Incoming request: ${req.method} ${req.url}`,
    customSuccessMessage: (req, res, responseTime) => `Request completed: ${req.method} ${req.url} - ${res.statusCode} in ${responseTime}ms`,
    customErrorMessage: (req, res, error) => `Request errored: ${req.method} ${req.url} - ${res.statusCode} - Error: ${error.message}`,
    serializers: {
        req: pino.stdSerializers.wrapRequestSerializer((r) => {
            return {}
        }),
        res: pino.stdSerializers.wrapResponseSerializer((r) => {
            return {}
        })
    }
}));

// - ROUTERS
server.use(checkKey);
server.use("/admin", adminRouter);
server.use("/chat", chatRouter);

// - START SERVER
server.listen(9500, () => {
    logger.info("Server is running on port 9500");
})