// remoteTraceExport.js
const { exec } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const execAsync = promisify(exec);
require("dotenv").config();

/**
 * Fetches tx_trace exactly as stored in MongoDB - no reformatting,
 * no reconstruction - and writes that same raw string to a file.
 */
async function fetchAndSaveGethTrace(txHash, outputDir, filePrefix) {
    const sshHost = process.env.SSH_HOST;
    const containerName = process.env.MONGO_CONTAINER || "mongodb";
    const remoteTmpQueryFile = `/tmp/query-${txHash.slice(2, 12)}.json`;
    const remoteTmpOutFile = `/tmp/tx_trace-${txHash.slice(2, 12)}.json`;

    const query = JSON.stringify({ tx_hash: txHash });
    const queryBase64 = Buffer.from(query).toString("base64");

    const remoteCommand =
        `docker exec ${containerName} sh -c "echo ${queryBase64} | base64 -d > ${remoteTmpQueryFile} && ` +
        `mongoexport --uri=mongodb://127.0.0.1:27017/geth --collection=transaction ` +
        `--queryFile=${remoteTmpQueryFile} --fields=tx_trace --out=${remoteTmpOutFile} && ` +
        `cat ${remoteTmpOutFile} && rm ${remoteTmpQueryFile} ${remoteTmpOutFile}"`;

    const { stdout } = await execAsync(`ssh ${sshHost} '${remoteCommand}'`, {
        maxBuffer: 1024 * 1024 * 50
    });

    if (!stdout || !stdout.trim()) {
        return null;
    }

    const gethTrace = JSON.parse(stdout.trim()).tx_trace;

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, `${filePrefix}-geth-trace.txt`), gethTrace);

    return gethTrace;
}

module.exports = { fetchAndSaveGethTrace };

// --- test call: only runs when this file is executed directly ---
if (require.main === module) {
    // paste a real tx_hash you know exists in the remote MongoDB collection
    const testTxHash = "0x3be0166954d99ce1e58b4a8ba4e2e0652b96b8d3bb2254ef48bd14643b0be3be";

    fetchAndSaveGethTrace(testTxHash, "./", "test")
        .then((result) => {
            if (result === null) {
                console.log("No document found for this tx_hash.");
            } else {
                console.log("Retrieved tx_trace (first 200 chars):", result.slice(0, 200));
                console.log("Full length:", result.length);
                console.log("Saved to ./traces/test/test-geth-trace.txt");
            }
            process.exit(0);
        })
        .catch((error) => {
            console.error("Test failed:", error);
            process.exit(1);
        });
}