/**
 * Optional AI risk analyst agent (hybrid).
 *
 * 1) Local tools gather score breakdown + on-chain context (no LLM).
 * 2) LLM writes a briefing that *evaluates* the deterministic score/factors
 *    and adds narrative, gaps, and actions — it does not replace the score.
 *
 * Env: OPENAI_API_KEY or ANTHROPIC_API_KEY (see prior docs).
 */
require("dotenv").config();

const { ethers } = require("ethers");

const AI_SCHEMA_VERSION = 2;

function aiEnabled() {
    if (String(process.env.RISK_AI_ENABLED || "").toLowerCase() === "false") return false;
    const openai = String(process.env.OPENAI_API_KEY || "").trim();
    const anthropic = String(process.env.ANTHROPIC_API_KEY || "").trim();
    return Boolean(openai || anthropic);
}

function llmProvider() {
    const explicit = String(process.env.RISK_AI_PROVIDER || "").toLowerCase();
    if (explicit === "anthropic" || explicit === "openai") return explicit;
    if (process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) return "anthropic";
    return "openai";
}

function fingerprint(contract) {
    return [
        `v${AI_SCHEMA_VERSION}`,
        contract.contractAddress,
        contract.chainId,
        contract.riskScore,
        contract.exploitCount,
        contract.totalStolenWei,
        contract.maxReentrancyCount,
        (contract.uniqueAttackers || []).length
    ].join("|");
}

function weiToEth(wei) {
    try {
        return ethers.formatEther(BigInt(wei || 0));
    } catch {
        return "0";
    }
}

function explorerBase(chainId) {
    return Number(chainId) === 1 ? "https://etherscan.io" : "https://sepolia.etherscan.io";
}

/** Tool: deterministic score evaluation inputs for the LLM. */
function toolScoreBreakdown(contract) {
    const factors = Array.isArray(contract.riskFactors) ? contract.riskFactors : [];
    const pointsSum = factors.reduce((s, f) => s + (Number(f.points) || 0), 0);
    const ranked = [...factors].sort((a, b) => (b.points || 0) - (a.points || 0));
    return {
        tool: "score_breakdown",
        riskScore: contract.riskScore,
        riskLevel: contract.riskLevel,
        riskSummary: contract.riskSummary || null,
        pointsSum,
        maxPossibleHint: 100,
        factors: factors.map(f => ({
            id: f.id,
            label: f.label,
            points: f.points,
            detail: f.detail,
            shareOfScorePct:
                pointsSum > 0 ? Math.round(((Number(f.points) || 0) / pointsSum) * 100) : 0
        })),
        topFactor: ranked[0]
            ? { id: ranked[0].id, label: ranked[0].label, points: ranked[0].points }
            : null,
        scoringNote:
            "Score is rule-based (volume log, exploit count, reentry depth, attackers, mainnet, recency). AI must critique it, not invent a new number as ground truth."
    };
}

/** Tool: compact exploit dossier. */
function toolExploitHistory(contract) {
    const exploits = Array.isArray(contract.exploits) ? contract.exploits : [];
    const sorted = [...exploits].sort((a, b) =>
        String(b.detectedAt || "").localeCompare(String(a.detectedAt || ""))
    );
    return {
        tool: "exploit_history",
        exploitCount: exploits.length,
        totalStolenEth: contract.totalStolenEth || weiToEth(contract.totalStolenWei),
        maxReentrancyCount: contract.maxReentrancyCount || 0,
        uniqueAttackers: contract.uniqueAttackers || [],
        firstDetectedAt: contract.firstDetectedAt || null,
        lastDetectedAt: contract.lastDetectedAt || null,
        exploits: sorted.slice(0, 8).map(e => ({
            txHash: e.txHash,
            stolenEth: e.stolenEth,
            reentrancyCount: e.reentrancyCount,
            blockNumber: e.blockNumber,
            attackers: e.attackerAddresses || [],
            functionSelector: e.functionSelector || null,
            detectedAt: e.detectedAt || null
        }))
    };
}

/** Tool: explorer deep-links. */
function toolExplorerLinks(contract) {
    const base = explorerBase(contract.chainId);
    const addr = contract.contractAddress;
    const latest = (contract.exploits || [])[0] || {};
    return {
        tool: "explorer_links",
        contractUrl: addr ? `${base}/address/${addr}` : null,
        latestTxUrl: latest.txHash ? `${base}/tx/${latest.txHash}` : null,
        network: contract.network,
        chainId: contract.chainId
    };
}

/**
 * Tool: live on-chain snapshot (balance + code present).
 * Uses analyze.js RPC providers when the UI was started via Hardhat.
 */
async function toolOnChainContext(contract) {
    const out = {
        tool: "on_chain_context",
        ok: false,
        ethBalance: null,
        hasCode: null,
        codeBytes: null,
        error: null
    };
    try {
        const { resolveProvider } = require("./analyze.js");
        const network =
            Number(contract.chainId) === 1 ? "mainnet" : contract.network || "sepolia";
        const { provider } = resolveProvider(network);
        const addr = contract.contractAddress;
        const [bal, code] = await Promise.all([
            provider.getBalance(addr),
            provider.getCode(addr)
        ]);
        out.ok = true;
        out.ethBalance = ethers.formatEther(bal);
        out.hasCode = Boolean(code && code !== "0x");
        out.codeBytes = code && code !== "0x" ? Math.max(0, (code.length - 2) / 2) : 0;
    } catch (err) {
        out.error = err.message || String(err);
    }
    return out;
}

/** Run all local tools before calling the LLM. */
async function runAnalystTools(contract) {
    const [onChain] = await Promise.all([toolOnChainContext(contract)]);
    return {
        scoreBreakdown: toolScoreBreakdown(contract),
        exploitHistory: toolExploitHistory(contract),
        explorerLinks: toolExplorerLinks(contract),
        onChainContext: onChain
    };
}

function buildBriefingPrompt(contract, toolResults) {
    const dossier = {
        contractAddress: contract.contractAddress,
        network: contract.network,
        chainId: contract.chainId,
        attackName: contract.attackName || "sf_reentrancy",
        tools: toolResults
    };

    return {
        system:
            "You are a smart-contract security risk analyst working with a hybrid pipeline. " +
            "A deterministic engine already computed riskScore (0-100), riskLevel, and riskFactors. " +
            "Your job is to EVALUATE that score using the tool outputs, explain what it captures well " +
            "and what it under/over-weights, and add operational context. " +
            "Do not invent transactions, amounts, balances, or addresses absent from the dossier. " +
            "If on_chain_context.ok is false, say live chain data was unavailable. " +
            "Respond with ONLY valid JSON matching the schema.",
        user:
            "Dossier (JSON from registry + tools):\n" +
            JSON.stringify(dossier, null, 2) +
            "\n\nReturn JSON:\n" +
            "{\n" +
            '  "headline": string (max 120 chars),\n' +
            '  "narrative": string (3-5 sentences; reference the numeric score),\n' +
            '  "scoreAssessment": {\n' +
            '    "agreesWithLevel": boolean,\n' +
            '    "suggestedLevel": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL",\n' +
            '    "rationale": string,\n' +
            '    "overweighted": string[0-3],\n' +
            '    "underweighted": string[0-3]\n' +
            "  },\n" +
            '  "factorInsights": string[3-5] (interpret top factors with their points),\n' +
            '  "severityDrivers": string[3],\n' +
            '  "additionalContext": string[2-4] (balance residual risk, reentry depth, explorer notes),\n' +
            '  "informationGaps": string[1-3],\n' +
            '  "recommendedActions": string[3-5] (specific, defensive, ordered by urgency),\n' +
            '  "confidence": "high"|"medium"|"low"\n' +
            "}"
    };
}

function extractJson(text) {
    if (!text) throw new Error("empty AI response");
    const trimmed = text.trim();
    try {
        return JSON.parse(trimmed);
    } catch {
        const start = trimmed.indexOf("{");
        const end = trimmed.lastIndexOf("}");
        if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
        throw new Error("AI response was not JSON");
    }
}

async function callOpenAI(system, user, signal) {
    const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${String(process.env.OPENAI_API_KEY || "").trim()}`
        },
        body: JSON.stringify({
            model,
            temperature: 0.2,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: system },
                { role: "user", content: user }
            ]
        }),
        signal
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
}

async function callAnthropic(system, user, signal) {
    const model = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest";
    const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": String(process.env.ANTHROPIC_API_KEY || "").trim(),
            "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
            model,
            max_tokens: 1200,
            temperature: 0.2,
            system,
            messages: [{ role: "user", content: user }]
        }),
        signal
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Anthropic HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const parts = data.content || [];
    return parts.map(p => p.text || "").join("\n");
}

function asStringList(v, max) {
    if (!Array.isArray(v)) return [];
    return v.map(String).filter(Boolean).slice(0, max);
}

async function generateAiRiskBriefing(contract) {
    if (!aiEnabled()) return null;

    const timeoutMs = Number(process.env.RISK_AI_TIMEOUT_MS || 20000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const toolResults = await runAnalystTools(contract);
        const { system, user } = buildBriefingPrompt(contract, toolResults);
        const raw =
            llmProvider() === "anthropic"
                ? await callAnthropic(system, user, controller.signal)
                : await callOpenAI(system, user, controller.signal);
        const parsed = extractJson(raw);
        const sa = parsed.scoreAssessment && typeof parsed.scoreAssessment === "object"
            ? parsed.scoreAssessment
            : {};

        return {
            provider: llmProvider(),
            schemaVersion: AI_SCHEMA_VERSION,
            generatedAt: new Date().toISOString(),
            fingerprint: fingerprint(contract),
            toolsUsed: Object.keys(toolResults),
            toolSnapshot: {
                score: toolResults.scoreBreakdown
                    ? {
                          riskScore: toolResults.scoreBreakdown.riskScore,
                          riskLevel: toolResults.scoreBreakdown.riskLevel,
                          topFactor: toolResults.scoreBreakdown.topFactor
                      }
                    : null,
                onChain: toolResults.onChainContext || null,
                links: toolResults.explorerLinks || null
            },
            headline: String(parsed.headline || "").slice(0, 160),
            narrative: String(parsed.narrative || ""),
            scoreAssessment: {
                agreesWithLevel: Boolean(sa.agreesWithLevel),
                suggestedLevel: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(sa.suggestedLevel)
                    ? sa.suggestedLevel
                    : contract.riskLevel,
                rationale: String(sa.rationale || ""),
                overweighted: asStringList(sa.overweighted, 3),
                underweighted: asStringList(sa.underweighted, 3)
            },
            factorInsights: asStringList(parsed.factorInsights, 5),
            severityDrivers: asStringList(parsed.severityDrivers, 5),
            additionalContext: asStringList(parsed.additionalContext, 4),
            informationGaps: asStringList(parsed.informationGaps, 3),
            recommendedActions: asStringList(parsed.recommendedActions, 5),
            confidence: ["high", "medium", "low"].includes(parsed.confidence)
                ? parsed.confidence
                : "medium"
        };
    } finally {
        clearTimeout(timer);
    }
}

async function enrichContractWithAi(contract, { force = false } = {}) {
    if (!aiEnabled() || !contract) return { contract, ai: null, skipped: true, reason: "AI disabled" };
    const fp = fingerprint(contract);
    if (
        !force &&
        contract.aiAssessment &&
        contract.aiAssessment.fingerprint === fp &&
        Number(contract.aiAssessment.schemaVersion) === AI_SCHEMA_VERSION
    ) {
        return { contract, ai: contract.aiAssessment, skipped: true, reason: "cached" };
    }
    const ai = await generateAiRiskBriefing(contract);
    if (!ai) return { contract, ai: null, skipped: true, reason: "no result" };
    contract.aiAssessment = ai;
    return { contract, ai, skipped: false };
}

module.exports = {
    AI_SCHEMA_VERSION,
    aiEnabled,
    fingerprint,
    runAnalystTools,
    generateAiRiskBriefing,
    enrichContractWithAi
};
