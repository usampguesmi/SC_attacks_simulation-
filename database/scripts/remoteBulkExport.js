// remoteBulkExport.js
const { exec } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const execAsync = promisify(exec);
require("dotenv").config();

/**
 * Fetches the last N documents from the remote MongoDB "transaction" collection,
 * ordered by _id descending (insertion order), and writes them as a single
 * JSON array file - full documents, no reformatting.
 */
async function fetchLastNTransactions(n, outputPath) {
    const sshHost = process.env.SSH_HOST;
    const containerName = process.env.MONGO_CONTAINER || "mongodb";
    const remoteTmpOutFile = `/tmp/last-${n}-transactions-${Date.now()}.json`;

    const remoteCommand =
        `docker exec ${containerName} sh -c "mongoexport --uri=mongodb://127.0.0.1:27017/geth ` +
        `--collection=transaction --sort='{\\"_id\\":-1}' --limit=${n} --jsonArray ` +
        `--out=${remoteTmpOutFile} && cat ${remoteTmpOutFile} && rm ${remoteTmpOutFile}"`;

    const { stdout } = await execAsync(`ssh ${sshHost} '${remoteCommand}'`, {
        maxBuffer: 1024 * 1024 * 200
    });

    if (!stdout || !stdout.trim()) {
        return null;
    }

    const transactions = JSON.parse(stdout.trim());

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(transactions, null, 2));

    return transactions;
}

module.exports = { fetchLastNTransactions };

// --- CLI usage: node database/scripts/remoteBulkExport.js [count] [outputPath] ---
if (require.main === module) {
    const n = parseInt(process.argv[2], 10) || 100;
    const outputPath =
        process.argv[3] ||
        path.join(__dirname, "../downloads", `last-${n}-transactions.json`);

    fetchLastNTransactions(n, outputPath)
        .then((result) => {
            if (result === null) {
                console.log("No documents found in the transaction collection.");
            } else {
                console.log(`Retrieved ${result.length} documents.`);
                console.log(`Saved to ${outputPath}`);
            }
            process.exit(0);
        })
        .catch((error) => {
            console.error("Bulk export failed:", error);
            process.exit(1);
        });
}
