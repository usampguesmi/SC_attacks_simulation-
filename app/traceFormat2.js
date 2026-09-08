/**
 * Shared format2 builder — same convention as utils/saveTrace.js
 * (pc;OP;reversed-stack-args).
 */
function structLogsToFormat2(structLogs) {
    if (!Array.isArray(structLogs)) {
        throw new Error("Trace is missing structLogs");
    }
    return structLogs
        .map(log => {
            const stack = Array.isArray(log.stack) ? [...log.stack].reverse() : [];
            const args = stack
                .map(value => {
                    const s = String(value);
                    return s.startsWith("0x") ? s : `0x${s}`;
                })
                .join(",");
            return `${log.pc};${log.op};${args}`;
        })
        .join("\n");
}

/**
 * Same RPC call saveTrace.js uses: debug_traceTransaction via an ethers/Hardhat provider.
 */
async function fetchFormat2ViaProvider(provider, txHash) {
    const [tx, receipt, trace] = await Promise.all([
        provider.getTransaction(txHash),
        provider.getTransactionReceipt(txHash),
        provider.send("debug_traceTransaction", [
            txHash,
            {
                disableMemory: false,
                disableStack: false,
                disableStorage: false
            }
        ])
    ]);

    if (!tx) {
        throw new Error(`Transaction not found: ${txHash}`);
    }
    if (!trace || !Array.isArray(trace.structLogs)) {
        throw new Error(
            "RPC returned no structLogs. This endpoint may not support debug_traceTransaction."
        );
    }

    return {
        format2: structLogsToFormat2(trace.structLogs),
        opcodeCount: trace.structLogs.length,
        meta: {
            txHash,
            blockNumber: receipt ? Number(receipt.blockNumber) : null,
            status: receipt ? receipt.status === 1 : null,
            from: tx.from,
            to: tx.to || (receipt && receipt.contractAddress) || null,
            valueWei: tx.value != null ? tx.value.toString() : null
        }
    };
}

module.exports = { structLogsToFormat2, fetchFormat2ViaProvider };
