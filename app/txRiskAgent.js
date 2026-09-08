/**
 * AI agent for pre-transaction risk briefings (human-in-the-loop).
 * Evaluates the deterministic pre-tx score + ledger hits; does not broadcast txs.
 */
require("dotenv").config();

const { aiEnabled } = require("./riskAgent.js");

function llmProvider() {
    const explicit = String(process.env.RISK_AI_PROVIDER || "").toLowerCase();
    if (explicit === "anthropic" || explicit === "openai") return explicit;
    if (process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) return "anthropic";
    return "openai";
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
            max_tokens: 1100,
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
    return (data.content || []).map(p => p.text || "").join("\n");
}

function asList(v, max) {
    if (!Array.isArray(v)) return [];
    return v.map(String).filter(Boolean).slice(0, max);
}

async function generatePreTxAiBriefing(assessment, signal) {
    if (!aiEnabled()) return null;

    const dossier = {
        purpose: "pre_broadcast_tx_risk",
        riskScore: assessment.riskScore,
        riskLevel: assessment.riskLevel,
        recommendation: assessment.recommendation,
        summary: assessment.summary,
        riskFactors: assessment.riskFactors,
        draft: assessment.draft,
        network: assessment.network,
        chainId: assessment.chainId,
        ledger: assessment.ledger,
        onChain: assessment.onChain
    };

    const system =
        "You are a pre-transaction security advisor. A deterministic engine already scored " +
        "a draft Ethereum transaction against a reentrancy vulnerability ledger. " +
        "Help a human decide CONTINUE or ABORT before broadcasting. " +
        "Do not invent ledger facts. Do not provide exploit instructions. " +
        "Be concrete about what could go wrong if they proceed. Respond with ONLY valid JSON.";

    const user =
        "Assessment dossier:\n" +
        JSON.stringify(dossier, null, 2) +
        "\n\nReturn JSON:\n" +
        "{\n" +
        '  "headline": string,\n' +
        '  "narrative": string (3-5 sentences for the human),\n' +
        '  "scoreEvaluation": string (does the numeric score fit? why?),\n' +
        '  "whatCouldGoWrong": string[2-4],\n' +
        '  "whyContinueMightBeOk": string[0-3],\n' +
        '  "suggestedDecision": "CONTINUE"|"ABORT"|"REVIEW",\n' +
        '  "questionsForHuman": string[2-4],\n' +
        '  "confidence": "high"|"medium"|"low"\n' +
        "}";

    const raw =
        llmProvider() === "anthropic"
            ? await callAnthropic(system, user, signal)
            : await callOpenAI(system, user, signal);
    const parsed = extractJson(raw);

    const suggested = String(parsed.suggestedDecision || "").toUpperCase();
    return {
        provider: llmProvider(),
        generatedAt: new Date().toISOString(),
        headline: String(parsed.headline || "").slice(0, 160),
        narrative: String(parsed.narrative || ""),
        scoreEvaluation: String(parsed.scoreEvaluation || ""),
        whatCouldGoWrong: asList(parsed.whatCouldGoWrong, 4),
        whyContinueMightBeOk: asList(parsed.whyContinueMightBeOk, 3),
        suggestedDecision: ["CONTINUE", "ABORT", "REVIEW"].includes(suggested)
            ? suggested
            : assessment.recommendation === "ALLOW"
              ? "CONTINUE"
              : assessment.recommendation,
        questionsForHuman: asList(parsed.questionsForHuman, 4),
        confidence: ["high", "medium", "low"].includes(parsed.confidence)
            ? parsed.confidence
            : "medium"
    };
}

module.exports = { generatePreTxAiBriefing };
