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

export async function insert(table: string, data: Record<string, unknown>): Promise<number> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map(() => "?").join(", ");
    const sql = `INSERT INTO ${table} (${keys.map((k) => `\`${k}\``).join(", ")}) VALUES (${placeholders})`;

    return runStatement<number>(sql, async (statement) => {
        const result = await statement.execute(values) as any;
        return result[0]?.insertId ?? 0;
    });
}

export async function remove(table: string, where: Record<string, unknown>): Promise<void> {
    const keys = Object.keys(where);
    const values = Object.values(where);
    const conditions = keys.map(key => `${key} = ?`).join(" AND ");

    return execute(`DELETE FROM ${table} WHERE ${conditions}`, values);
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