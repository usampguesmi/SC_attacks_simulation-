const pool = require("./db");

async function main() {
    try {
        const result = await pool.query("SELECT NOW()");

        console.log("Database connected successfully!");
        console.log("Database time:", result.rows[0].now);

    } catch (error) {

        console.error("Database connection failed:");
        console.error(error);

    } finally {

        await pool.end();
    }
}

main();