import mysql from "mysql2";
import { PreparedStatementInfo } from "mysql2/promise";
import config from "../config.json";

export const DATABASE: mysql.Pool = mysql.createPool({
    host: config.database.host,
    user: config.database.user,
    password: config.database.password || "",
    database: config.database.database
})

export async function query<T>(sql: string, values?: unknown[]): Promise<T[]> {
    return runStatement<T[]>(sql, async (statement) => {
        const [rows] = await statement.execute(values);
        return rows as T[];
    });
}

export async function queryOne<T>(sql: string, values?: unknown[]): Promise<T | null> {
    return runStatement<T | null>(sql, async (statement) => {
        const [rows] = await statement.execute(values);
        const result = rows as T[];

        return result[0] ?? null;
    });
}

export async function execute(sql: string, values?: unknown[]): Promise<void> {
    return runStatement<void>(sql, async (statement) => {
        await statement.execute(values);
    });
}

export async function runStatement<T>(sql: string, executor: (statement: PreparedStatementInfo) => Promise<T>): Promise<T> {
    const connection = await DATABASE.promise().getConnection();
    const prepared = await connection.prepare(sql);

    const result = await executor(prepared);
    
    await prepared.close();
    connection.release();

    return result;
}

export async function end() {
    DATABASE.end();
}