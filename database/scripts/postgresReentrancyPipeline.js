// Runs the validated reentrancyDetector.js against every transaction already recorded in our
// own PostgreSQL dataset (main_transaction.opcode_stack_traces - the same format2.txt convention,
// stored inline, so no conversion is needed here the way the historical MongoDB dataset needed
// one), and persists one result row per transaction into reentrancy_detection_results (created
// once, upserted by tx_hash on every run).
//
// This is our own small, predefined dataset (61 rows as of writing: Sepolia simulations of the
// safe/malicious scenario suites plus the original attackCount_0-N hand-analyzed traces), so
// unlike the MongoDB historical dataset this uses the FULL detector - address/value/selector
// extraction all apply correctly here, no degraded "structural-only" fallback needed.
//
// Usage:
//   node database/scripts/postgresReentrancyPipeline.js

require("dotenv").config();
const pool = require("../db");
const { detectReentrancyFromContent } = require("./reentrancyDetector.js");

const CREATE_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS reentrancy_detection_results (
        result_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        main_tx_id BIGINT NOT NULL,
        tx_hash VARCHAR(70) NOT NULL,
        function_name VARCHAR(255),
        transaction_purpose transaction_purpose_enum,
        from_address VARCHAR(50),
        to_address VARCHAR(50),
        block_number BIGINT,
        tx_timestamp TIMESTAMPTZ,
        verdict VARCHAR(30) NOT NULL,
        reentrancy_count INT,
        total_invocations_found INT,
        victim_contract VARCHAR(50),
        attacker_address VARCHAR(50),
        function_selector VARCHAR(20),
        value_per_call_wei NUMERIC(78,0),
        total_drained_wei NUMERIC(78,0),
        detection_detail JSONB NOT NULL,
        analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_reentrancy_results_tx UNIQUE (tx_hash)
    );
`;

const UPSERT_SQL = `
    INSERT INTO reentrancy_detection_results (
        main_tx_id, tx_hash, function_name, transaction_purpose,
        from_address, to_address, block_number, tx_timestamp,
        verdict, reentrancy_count, total_invocations_found,
        victim_contract, attacker_address, function_selector,
        value_per_call_wei, total_drained_wei, detection_detail
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    ON CONFLICT (tx_hash) DO UPDATE SET
        main_tx_id = EXCLUDED.main_tx_id,
        function_name = EXCLUDED.function_name,
        transaction_purpose = EXCLUDED.transaction_purpose,
        from_address = EXCLUDED.from_address,
        to_address = EXCLUDED.to_address,
        block_number = EXCLUDED.block_number,
        tx_timestamp = EXCLUDED.tx_timestamp,
        verdict = EXCLUDED.verdict,
        reentrancy_count = EXCLUDED.reentrancy_count,
        total_invocations_found = EXCLUDED.total_invocations_found,
        victim_contract = EXCLUDED.victim_contract,
        attacker_address = EXCLUDED.attacker_address,
        function_selector = EXCLUDED.function_selector,
        value_per_call_wei = EXCLUDED.value_per_call_wei,
        total_drained_wei = EXCLUDED.total_drained_wei,
        detection_detail = EXCLUDED.detection_detail,
        analyzed_at = now();
`;

const bigIntSafe = (key, value) => (typeof value === "bigint" ? value.toString() : value);

async function main() {
    await pool.query(CREATE_TABLE_SQL);

    const { rows } = await pool.query(`
        SELECT tx_id, tx_hash, function_name, transaction_purpose,
               from_address, to_address, block_number, tx_timestamp, opcode_stack_traces
        FROM main_transaction
        ORDER BY tx_id
    `);
    console.log(`Fetched ${rows.length} transactions from main_transaction.`);

    const summary = {};
    const flagged = [];

    for (const row of rows) {
        let detection;
        if (!row.opcode_stack_traces) {
            detection = { verdict: "NO_TRACE", reason: "opcode_stack_traces is empty" };
        } else {
            try {
                detection = detectReentrancyFromContent(row.opcode_stack_traces);
            } catch (err) {
                detection = { verdict: "ERROR", error: err.message };
            }
        }

        summary[detection.verdict] = (summary[detection.verdict] || 0) + 1;
        if (detection.verdict === "REENTRANCY_DETECTED") {
            flagged.push({ tx_hash: row.tx_hash, function_name: row.function_name, reentrancyCount: detection.reentrancyCount });
        }

        await pool.query(UPSERT_SQL, [
            row.tx_id,
            row.tx_hash,
            row.function_name,
            row.transaction_purpose,
            row.from_address,
            row.to_address,
            row.block_number,
            row.tx_timestamp,
            detection.verdict,
            detection.reentrancyCount ?? null,
            detection.totalInvocationsFound ?? null,
            detection.victimContract ?? null,
            detection.attackerAddress ?? null,
            detection.functionSelector ?? null,
            detection.valuePerCallWei ?? null,
            detection.totalDrainedWei ?? null,
            JSON.parse(JSON.stringify(detection, bigIntSafe))
        ]);
    }

    console.log("\nVerdict summary:", summary);
    console.log(`\nFlagged REENTRANCY_DETECTED (${flagged.length}):`);
    flagged.forEach(f => console.log(`  ${f.function_name} (${f.tx_hash}) - ${f.reentrancyCount} reentries`));

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
