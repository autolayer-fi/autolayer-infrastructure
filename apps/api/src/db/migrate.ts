import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pool } from "./pool.js";
import { logger } from "../utils/logger.js";

const here = path.dirname(fileURLToPath(import.meta.url));

const migrationsDir = path.resolve(here, "../../migrations");

async function migrate(): Promise<void> {
	await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

	const files = (await readdir(migrationsDir))
		.filter((file) => file.endsWith(".sql"))
		.sort();

	for (const file of files) {
		const existing = await pool.query(
			"SELECT 1 FROM schema_migrations WHERE name = $1",
			[file],
		);

		if (existing.rowCount) {
			logger.info({ file }, "migration already applied");
			continue;
		}

		const sql = await readFile(path.join(migrationsDir, file), "utf8");

		const client = await pool.connect();

		try {
			await client.query("BEGIN");

			await client.query(sql);

			await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [
				file,
			]);

			await client.query("COMMIT");

			logger.info({ file }, "migration applied");
		} catch (error) {
			await client.query("ROLLBACK");

			// logger.error(
			//   {
			//     file,
			//     error,
			//   },
			//   "migration failed"
			// );

			logger.error(
				{
					file,
					error:
						error instanceof Error
							? {
									name: error.name,
									message: error.message,
									stack: error.stack,
								}
							: error,
				},
				"migration failed",
			);

			throw error;
		} finally {
			client.release();
		}
	}

	await pool.end();
}

// migrate().catch((error) => {
// 	logger.error({ error }, "migration process failed");
// 	process.exit(1);
// });

migrate().catch((error) => {
	logger.error(
		{
			error:
				error instanceof Error
					? {
							name: error.name,
							message: error.message,
							stack: error.stack,
						}
					: error,
		},
		"migration process failed",
	);

	process.exit(1);
});
