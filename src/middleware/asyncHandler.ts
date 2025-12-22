import type { NextFunction, Request, RequestHandler, Response } from "express";
import { logger } from "../../lib/util";

export default function asyncHandler<T extends Record<string, any>>(
    fn: (req: Request<T>, res: Response, next: NextFunction) => Promise<any>
): RequestHandler {
    return (req, res, next) => {
        Promise.resolve(fn(req as Request<T>, res, next)).catch((e) => {
            logger.error(e)
            console.log(e)
            
            res.status(500).json({
                success: false,
                message: "an internal server error has occured. if you see this, please ping yuki about it!",
                data: {
                    error: e
                }
            })
        });
    }
}