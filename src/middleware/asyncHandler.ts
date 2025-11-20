import type { NextFunction, Request, RequestHandler, Response } from "express";

export default function asyncHandler<T extends Record<string, any>>(
    fn: (req: Request<T>, res: Response, next: NextFunction) => Promise<any>
): RequestHandler {
    return (req, res, next) => {
        Promise.resolve(fn(req as Request<T>, res, next)).catch(next);
    }
}