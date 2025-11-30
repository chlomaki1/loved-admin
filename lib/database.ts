import mysql from "mysql2";
import config from "../config.json";

export const DATABASE: mysql.Pool = mysql.createPool({
    host: config.database.host,
    user: config.database.user,
    password: config.database.password || "",
    database: config.database.database
});

// --- core runner (safe version) ---
type ExecuteResult = [any, mysql.FieldPacket[]];

export async function runStatement<T>(
    sql: string,
    executor: (execute: (values?: unknown[]) => Promise<[any[], any]>) => Promise<T>
): Promise<T> {
    const connection = await DATABASE.promise().getConnection();

    const exec = async (values?: unknown[]) => {
        return connection.execute(sql, values) as Promise<ExecuteResult>;
    };

    try {
        const result = await executor(exec);
        return result;
    } finally {
        connection.release();
    }
}

// --- helpers ---

export async function query<T>(sql: string, values?: unknown[]): Promise<T[]> {
    return runStatement<T[]>(sql, async (exec) => {
        const [rows] = await exec(values);
        return rows as T[];
    });
}

export async function queryOne<T>(sql: string, values?: unknown[]): Promise<T | null> {
    return runStatement<T | null>(sql, async (exec) => {
        const [rows] = await exec(values);
        const result = rows as T[];
        return result[0] ?? null;
    });
}

export async function insert(
    table: string,
    data: Record<string, unknown>
): Promise<number> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map(() => "?").join(", ");
    const sql = `INSERT INTO ${table} (${keys.map(k => `\`${k}\``).join(", ")}) VALUES (${placeholders})`;

    return runStatement<number>(sql, async (exec) => {
        const [result]: any = await exec(values);
        return result.insertId ?? 0;
    });
}

export async function remove(
    table: string,
    where: Record<string, unknown>
): Promise<void> {
    const keys = Object.keys(where);
    const values = Object.values(where);
    const conditions = keys.map(key => `${key} = ?`).join(" AND ");
    const sql = `DELETE FROM ${table} WHERE ${conditions}`;
    await execute(sql, values);
}

export async function execute(sql: string, values?: unknown[]): Promise<void> {
    await runStatement<void>(sql, async (exec) => {
        await exec(values);
    });
}

export async function end() {
    DATABASE.end();
}
