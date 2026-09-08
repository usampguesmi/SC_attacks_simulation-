const form = document.getElementById("analyze-form");
const input = document.getElementById("tx-hash");
const networkEl = document.getElementById("network");
const format2El = document.getElementById("format2");
const datasetFileEl = document.getElementById("dataset-file");
const datasetFileNameEl = document.getElementById("dataset-file-name");
const btn = document.getElementById("submit-btn");
const pasteBtn = document.getElementById("submit-paste-btn");
const datasetBtn = document.getElementById("submit-dataset-btn");
const refreshRegistryBtn = document.getElementById("refresh-registry-btn");
const pretxBtn = document.getElementById("submit-pretx-btn");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const modeHash = document.getElementById("mode-hash");
const modePaste = document.getElementById("mode-paste");
const modeDataset = document.getElementById("mode-dataset");
const modeRegistry = document.getElementById("mode-registry");
const modePretx = document.getElementById("mode-pretx");

let mode = "hash";
let lastDataset = null;
let lastPretxAssessmentId = null;
let publicAiAllowed = true;

async function syncPublicConfig() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    if (!res.ok) return;
    publicAiAllowed = data.publicAi !== false;
    const aiBox = document.getElementById("pretx-with-ai");
    if (aiBox) {
      if (!publicAiAllowed) {
        aiBox.checked = false;
        aiBox.disabled = true;
        aiBox.parentElement && (aiBox.parentElement.title = "AI disabled in public mode");
      }
    }
  } catch {
    /* ignore */
  }
}
syncPublicConfig();

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    mode = tab.dataset.mode;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    modeHash.hidden = mode !== "hash";
    modePaste.hidden = mode !== "paste";
    modeDataset.hidden = mode !== "dataset";
    modeRegistry.hidden = mode !== "registry";
    if (modePretx) modePretx.hidden = mode !== "pretx";
    if (mode === "registry") loadRegistry();
  });
});

datasetFileEl.addEventListener("change", () => {
  const f = datasetFileEl.files && datasetFileEl.files[0];
  datasetFileNameEl.hidden = !f;
  datasetFileNameEl.textContent = f ? `Selected: ${f.name} (${Math.round(f.size / 1024)} KB)` : "";
});

if (refreshRegistryBtn) {
  refreshRegistryBtn.addEventListener("click", (e) => {
    e.preventDefault();
    loadRegistry();
  });
}

function setStatus(message, isError = false) {
  statusEl.hidden = !message;
  statusEl.textContent = message || "";
  statusEl.classList.toggle("error", Boolean(isError));
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function verdictClass(verdict) {
  if (verdict === "REENTRANCY_DETECTED") return "detected";
  if (verdict === "NOT_REENTRANT") return "safe";
  return "inconclusive";
}

function metaItem(label, value) {
  if (value === null || value === undefined || value === "") return "";
  return `<div class="meta-item"><span class="k">${esc(label)}</span><span class="v">${esc(value)}</span></div>`;
}

function chainTable(rows) {
  if (!rows || !rows.length) return "";
  const body = rows
    .map(
      (r) => `<tr>
      <td>D${esc(r.depth)}</td>
      <td>${esc(r.p1Index)}</td>
      <td>${esc(r.p2Index)}</td>
      <td>${esc(r.hasSload)}</td>
      <td>${esc(r.hasSstore)}</td>
      <td>${esc(r.callValueEth)}</td>
      <td>${esc(r.recipient)}</td>
    </tr>`
    )
    .join("");
  return `<div class="table-wrap"><table>
    <thead><tr>
      <th>Depth</th><th>p1 node</th><th>p2 node</th><th>SLOAD</th><th>SSTORE</th><th>Value (ETH)</th><th>Recipient</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function riskLevelClass(level) {
  const l = String(level || "").toUpperCase();
  if (l === "CRITICAL") return "risk-critical";
  if (l === "HIGH") return "risk-high";
  if (l === "MEDIUM") return "risk-medium";
  return "risk-low";
}

function renderAiBriefing(c, { chainId, address, showButton } = {}) {
  const ai = c && c.aiAssessment;
  const btn =
    showButton && chainId != null && address
      ? `<div class="row" style="margin-top:0.75rem">
          <button type="button" class="secondary" id="ai-assess-btn"
            data-chain="${esc(chainId)}" data-addr="${esc(address)}">
            ${ai ? "Refresh AI briefing" : "Run AI risk briefing"}
          </button>
        </div>`
      : "";
  if (!ai) {
    return `
      <section class="section ai-briefing">
        <h2>AI risk briefing</h2>
        <div class="section-body">
          <p class="chain-meta">Runs local tools (score breakdown, exploit history, on-chain balance) then asks the LLM to evaluate the rule-based score.</p>
          ${btn}
        </div>
      </section>`;
  }

  const list = (items) =>
    (items || []).length ? `<ul class="groups">${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";

  const sa = ai.scoreAssessment || {};
  const snap = ai.toolSnapshot || {};
  const onChain = snap.onChain || {};
  const links = snap.links || {};

  const scoreBlock = `
    <div class="ai-score-eval">
      <p class="field-label">Score evaluation (AI vs rule-based ${esc(c.riskScore)}/100 · ${esc(c.riskLevel)})</p>
      <p class="reason">
        ${sa.agreesWithLevel ? "Agrees with" : "Would adjust"} level
        → <strong>${esc(sa.suggestedLevel || c.riskLevel)}</strong>.
        ${esc(sa.rationale || "")}
      </p>
      ${
        (sa.overweighted || []).length
          ? `<p class="chain-meta">May overweight: ${esc((sa.overweighted || []).join("; "))}</p>`
          : ""
      }
      ${
        (sa.underweighted || []).length
          ? `<p class="chain-meta">May underweight: ${esc((sa.underweighted || []).join("; "))}</p>`
          : ""
      }
    </div>`;

  const toolMeta = `
    <p class="chain-meta">
      Tools: ${esc((ai.toolsUsed || []).join(", ") || "—")}
      ${onChain.ok ? ` · live balance ${esc(onChain.ethBalance)} ETH` : onChain.error ? ` · on-chain: ${esc(onChain.error)}` : ""}
      ${links.contractUrl ? ` · <a href="${esc(links.contractUrl)}" target="_blank" rel="noopener">explorer</a>` : ""}
      ${links.latestTxUrl ? ` · <a href="${esc(links.latestTxUrl)}" target="_blank" rel="noopener">latest exploit tx</a>` : ""}
    </p>`;

  return `
    <section class="section ai-briefing">
      <h2>AI risk briefing <span class="chain-meta">(${esc(ai.confidence)} confidence · ${esc(ai.provider)})</span></h2>
      <div class="section-body">
        <p class="verdict-value" style="font-size:1.1rem">${esc(ai.headline)}</p>
        <p class="reason">${esc(ai.narrative)}</p>
        ${scoreBlock}
        ${(ai.factorInsights || []).length ? `<p class="field-label">Factor insights</p>${list(ai.factorInsights)}` : ""}
        ${(ai.severityDrivers || []).length ? `<p class="field-label">Drivers</p>${list(ai.severityDrivers)}` : ""}
        ${(ai.additionalContext || []).length ? `<p class="field-label">Additional context</p>${list(ai.additionalContext)}` : ""}
        ${(ai.informationGaps || []).length ? `<p class="field-label">Information gaps</p>${list(ai.informationGaps)}` : ""}
        ${(ai.recommendedActions || []).length ? `<p class="field-label">Recommended actions</p>${list(ai.recommendedActions)}` : ""}
        ${toolMeta}
        <p class="chain-meta">Generated ${esc((ai.generatedAt || "").slice(0, 19))}</p>
        ${btn}
      </div>
    </section>`;
}

function renderRiskCard(registryUpdate, opts = {}) {
  if (!registryUpdate || !registryUpdate.contract) return "";
  const c = registryUpdate.contract;
  const factors = (c.riskFactors || [])
    .map(
      (f) => `<div class="risk-factor">
        <div class="risk-factor-top"><span>${esc(f.label)}</span><strong>+${esc(f.points)}</strong></div>
        <div class="risk-bar"><span style="width:${Math.min(100, (Number(f.points) / 40) * 100)}%"></span></div>
        <p class="chain-meta">${esc(f.detail)}</p>
      </div>`
    )
    .join("");
  const note = registryUpdate.duplicate
    ? "Exploit already recorded — risk score refreshed."
    : registryUpdate.recorded
      ? "New exploit recorded in the registry."
      : "";
  const aiNote = registryUpdate.aiPending
    ? " AI briefing queued in background (refresh registry in a few seconds)."
    : "";
  return `
    <section class="verdict-card ${riskLevelClass(c.riskLevel)}">
      <p class="verdict-label">Contract risk assessment</p>
      <p class="verdict-value">${esc(c.riskLevel)} · ${esc(c.riskScore)}/100</p>
      <p class="reason">${esc(c.riskSummary || "")}${note ? " " + esc(note) : ""}${esc(aiNote)}</p>
    </section>
    <div class="meta-grid">
      ${metaItem("Vulnerable contract", c.contractAddress)}
      ${metaItem("Network", `${c.network} (chain ${c.chainId})`)}
      ${metaItem("Total stolen", `${c.totalStolenEth} ETH`)}
      ${metaItem("Exploits", c.exploitCount)}
      ${metaItem("Unique attackers", (c.uniqueAttackers || []).length)}
      ${metaItem("Max reentries", c.maxReentrancyCount)}
      ${metaItem("First seen", c.firstDetectedAt)}
      ${metaItem("Last seen", c.lastDetectedAt)}
    </div>
    <section class="section">
      <h2>Risk factors</h2>
      <div class="section-body risk-factors">${factors}</div>
    </section>
    ${renderAiBriefing(c, {
      chainId: c.chainId,
      address: c.contractAddress,
      showButton: Boolean(opts.showAiButton)
    })}
  `;
}

function render(data) {
  const d = data.detection;
  const cls = verdictClass(d.verdict);

  const attackDetails =
    d.verdict === "REENTRANCY_DETECTED"
      ? [
          metaItem("Vulnerable contract", d.victimContract),
          metaItem("Function selector", d.functionSelector),
          metaItem("Recipient of funds", d.attackerAddress),
          metaItem("Value per call", d.valuePerCallEth != null ? `${d.valuePerCallEth} ETH` : null),
          metaItem("Reentries", `${d.reentrancyCount} (of ${d.totalInvocationsFound} invocations)`),
          metaItem("Total drained (beyond original)", d.totalDrainedEth != null ? `${d.totalDrainedEth} ETH` : null),
          metaItem("Depth range", d.minDepth != null ? `D${d.minDepth} … D${d.maxDepth}` : null)
        ].join("")
      : "";

  const groups =
    d.rawRepeatedGroups && d.rawRepeatedGroups.length
      ? `<ul class="groups">${d.rawRepeatedGroups
          .map(
            (g) =>
              `<li>nodes [${esc(g.nodeIndices.join(","))}] → depths [${esc(
                g.depths.map((x) => "D" + x).join(",")
              )}] (${esc(g.kind)})</li>`
          )
          .join("")}</ul>`
      : `<p class="chain-meta">None</p>`;

  const chains = (d.chains || [])
    .map((c, i) => {
      const primary = i === d.primaryChainIndex;
      return `<div class="chain">
        <p class="chain-title">
          Function chain${c.victimContract ? ` @ ${esc(c.victimContract)}` : ""}
          ${primary ? '<span class="primary-badge">Primary</span>' : ""}
        </p>
        <p class="chain-meta">verdict=${esc(c.verdict)}${c.reason ? `, reason=${esc(c.reason)}` : ""}</p>
        ${chainTable(c.chain)}
      </div>`;
    })
    .join("");

  return `
    <section class="verdict-card ${cls}">
      <p class="verdict-label">Verdict</p>
      <p class="verdict-value">${esc(d.verdict)}</p>
      ${d.reason ? `<p class="reason">${esc(d.reason)}</p>` : ""}
    </section>

    ${renderRiskCard(data.riskRegistry)}

    <div class="meta-grid">
      ${metaItem("Transaction", data.txHash)}
      ${metaItem("Network", data.network)}
      ${metaItem("Trace source", data.traceSource)}
      ${metaItem("Opcodes", data.opcodeCount)}
      ${metaItem("Block", data.meta && data.meta.blockNumber)}
      ${metaItem("From", data.meta && (data.meta.from || data.meta.from_address))}
      ${metaItem("To", data.meta && (data.meta.to || data.meta.to_address))}
      ${metaItem("Function", data.meta && data.meta.functionName)}
      ${metaItem("Purpose", data.meta && data.meta.transactionPurpose)}
      ${metaItem("Nodes in trace", d.nodeCount)}
      ${metaItem("Repeated groups", d.rawRepeatedGroupCount)}
      ${metaItem("Distinct functions", d.chains ? d.chains.length : 0)}
      ${attackDetails}
    </div>

    <section class="section">
      <h2>Repeated groups (before p1/p2 pairing)</h2>
      <div class="section-body">${groups}</div>
    </section>

    <section class="section">
      <h2>Function chains</h2>
      <div class="section-body">${chains || '<p class="chain-meta">No reconstructed chains</p>'}</div>
    </section>

    ${
      data.report
        ? `<section class="section">
      <h2>Full detector report</h2>
      <pre class="report">${esc(data.report)}</pre>
    </section>`
        : ""
    }
  `;
}

function renderDataset(batch) {
  const { summary, results } = batch;
  const verdictBits = Object.entries(summary.byVerdict || {})
    .map(([v, n]) => `<div class="meta-item"><span class="k">${esc(v)}</span><span class="v">${esc(n)}</span></div>`)
    .join("");

  const rows = results
    .map((r) => {
      const v = r.detection.verdict;
      const cls = verdictClass(v);
      return `<tr class="dataset-row ${cls}" data-index="${r.index}" tabindex="0">
        <td>${esc(r.index)}</td>
        <td class="hash-cell" title="${esc(r.txHash)}">${esc(r.txHash)}</td>
        <td>${esc((r.meta && r.meta.functionName) || "—")}</td>
        <td>${esc((r.meta && r.meta.transactionPurpose) || "—")}</td>
        <td><span class="verdict-pill ${cls}">${esc(v)}</span></td>
        <td>${esc(r.detection.reentrancyCount ?? "—")}</td>
        <td class="hash-cell">${esc(r.detection.victimContract || "—")}</td>
        <td>${esc(r.detection.totalDrainedEth ?? "—")}</td>
      </tr>`;
    })
    .join("");

  resultsEl.hidden = false;
  resultsEl.innerHTML = `
    <section class="verdict-card ${summary.flaggedCount ? "detected" : "safe"}">
      <p class="verdict-label">Dataset summary</p>
      <p class="verdict-value">${esc(summary.total)} transactions · ${esc(summary.flaggedCount)} reentrancy</p>
    </section>
    <div class="meta-grid">
      ${metaItem("Total", summary.total)}
      ${metaItem("Flagged", summary.flaggedCount)}
      ${verdictBits}
    </div>
    <section class="section">
      <h2>Per-transaction results <span class="chain-meta">(click a row for full report)</span></h2>
      <div class="section-body table-wrap">
        <table class="dataset-table">
          <thead>
            <tr>
              <th>#</th><th>Tx hash</th><th>Function</th><th>Purpose</th>
              <th>Verdict</th><th>Reentries</th><th>Victim</th><th>Drained (ETH)</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
    <div id="dataset-detail" class="dataset-detail" hidden></div>
  `;

  resultsEl.querySelectorAll(".dataset-row").forEach((tr) => {
    const open = () => {
      const idx = Number(tr.dataset.index);
      const row = results.find((r) => r.index === idx);
      if (!row) return;
      resultsEl.querySelectorAll(".dataset-row").forEach((x) => x.classList.remove("selected"));
      tr.classList.add("selected");
      const detail = document.getElementById("dataset-detail");
      detail.hidden = false;
      detail.innerHTML = `<section class="section"><h2>Detail · #${esc(idx)} · ${esc(row.txHash)}</h2>
        <div class="section-body detail-stack">${render(row)}</div></section>`;
      detail.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    tr.addEventListener("click", open);
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}

function setBusy(busy) {
  btn.disabled = busy;
  pasteBtn.disabled = busy;
  datasetBtn.disabled = busy;
  if (refreshRegistryBtn) refreshRegistryBtn.disabled = busy;
  if (pretxBtn) pretxBtn.disabled = busy;
}

function wireAiAssessButton(root) {
  const btn = root && root.querySelector("#ai-assess-btn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const chain = btn.dataset.chain;
    const addr = btn.dataset.addr;
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = "Running AI…";
    try {
      const res = await fetch(`/api/registry/${chain}/${addr}/ai-assess`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.reason || data.error || "AI assess failed");
      const c = data.contract;
      const briefing = root.querySelector(".ai-briefing");
      if (briefing && c) {
        briefing.outerHTML = renderAiBriefing(c, {
          chainId: c.chainId,
          address: c.contractAddress,
          showButton: true
        });
        wireAiAssessButton(root);
      }
      setStatus(data.skipped ? "AI briefing already cached." : "AI risk briefing saved.");
    } catch (err) {
      setStatus(err.message || "AI assess failed", true);
      btn.disabled = false;
      btn.textContent = prev;
    }
  });
}

async function loadRegistry() {
  setStatus("Loading risk registry…");
  resultsEl.hidden = true;
  try {
    const res = await fetch("/api/registry?sortBy=riskScore");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    setStatus(
      data.count
        ? `${data.count} vulnerable contract(s) in registry`
        : "Registry is empty — run an analysis that detects reentrancy first."
    );
    renderRegistry(data);
  } catch (err) {
    setStatus(err.message || "Failed to load registry", true);
  }
}

function renderRegistry(data) {
  const contracts = data.contracts || [];
  if (!contracts.length) {
    resultsEl.hidden = false;
    resultsEl.innerHTML = `<section class="section"><div class="section-body"><p class="chain-meta">No vulnerable contracts recorded yet.</p></div></section>`;
    return;
  }

  const rows = contracts
    .map((c, i) => {
      const cls = riskLevelClass(c.riskLevel);
      return `<tr class="dataset-row" data-addr="${esc(c.contractAddress)}" data-chain="${esc(c.chainId)}" tabindex="0">
        <td>${esc(i + 1)}</td>
        <td><span class="verdict-pill ${cls}">${esc(c.riskLevel)}</span> ${esc(c.riskScore)}</td>
        <td class="hash-cell" title="${esc(c.contractAddress)}">${esc(c.contractAddress)}</td>
        <td>${esc(c.network)}</td>
        <td>${esc(c.totalStolenEth)}</td>
        <td>${esc(c.exploitCount)}</td>
        <td>${esc((c.uniqueAttackers || []).length)}</td>
        <td>${esc(c.maxReentrancyCount)}</td>
        <td>${esc((c.lastDetectedAt || "").slice(0, 19))}</td>
      </tr>`;
    })
    .join("");

  resultsEl.hidden = false;
  resultsEl.innerHTML = `
    <section class="verdict-card">
      <p class="verdict-label">Risk registry</p>
      <p class="verdict-value">${esc(contracts.length)} contracts</p>
      <p class="reason">Updated ${esc(data.updatedAt || "—")}</p>
    </section>
    <section class="section">
      <h2>Contracts by risk <span class="chain-meta">(click a row for exploits)</span></h2>
      <div class="section-body table-wrap">
        <table class="dataset-table">
          <thead>
            <tr>
              <th>#</th><th>Risk</th><th>Contract</th><th>Network</th>
              <th>Stolen (ETH)</th><th>Exploits</th><th>Attackers</th><th>Max reentries</th><th>Last seen</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
    <div id="registry-detail" class="dataset-detail" hidden></div>
  `;

  resultsEl.querySelectorAll(".dataset-row").forEach((tr) => {
    tr.addEventListener("click", async () => {
      const addr = tr.dataset.addr;
      const chain = tr.dataset.chain;
      const detail = document.getElementById("registry-detail");
      detail.hidden = false;
      detail.innerHTML = `<section class="section"><div class="section-body"><p class="chain-meta">Loading…</p></div></section>`;
      try {
        const res = await fetch(`/api/registry/${chain}/${addr}`);
        const c = await res.json();
        if (!res.ok) throw new Error(c.error || "Not found");
        const exploits = (c.exploits || [])
          .map(
            (e) => `<tr>
              <td class="hash-cell" title="${esc(e.txHash)}">${esc(e.txHash)}</td>
              <td>${esc(e.blockNumber ?? "—")}</td>
              <td>${esc(e.stolenEth)}</td>
              <td>${esc(e.reentrancyCount)}</td>
              <td class="hash-cell">${esc((e.attackerAddresses || []).join(", "))}</td>
              <td>${esc(e.attackName)}</td>
              <td>${esc((e.detectedAt || "").slice(0, 19))}</td>
            </tr>`
          )
          .join("");
        detail.innerHTML = `
          ${renderRiskCard({ contract: c, recorded: false }, { showAiButton: true })}
          <section class="section">
            <h2>Exploits against this contract</h2>
            <div class="section-body table-wrap">
              <table class="dataset-table">
                <thead><tr>
                  <th>Tx hash</th><th>Block</th><th>Stolen (ETH)</th><th>Reentries</th>
                  <th>Attackers</th><th>Attack</th><th>Detected</th>
                </tr></thead>
                <tbody>${exploits}</tbody>
              </table>
            </div>
          </section>
        `;
        wireAiAssessButton(detail);
      } catch (err) {
        detail.innerHTML = `<section class="section"><div class="section-body"><p class="reason">${esc(err.message)}</p></div></section>`;
      }
    });
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

function listItems(items) {
  if (!items || !items.length) return "";
  return `<ul class="groups">${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
}

function renderPretx(payload) {
  const a = payload.assessment;
  if (!a) return;
  const factors = (a.riskFactors || [])
    .map(
      (f) => `<div class="risk-factor">
        <div class="risk-factor-top"><span>${esc(f.label)}</span><strong>+${esc(f.points)}</strong></div>
        <div class="risk-bar"><span style="width:${Math.min(100, (Number(f.points) / 55) * 100)}%"></span></div>
        <p class="chain-meta">${esc(f.detail)}</p>
      </div>`
    )
    .join("");

  const ai = a.aiBriefing;
  const aiHtml = ai
    ? `<section class="section ai-briefing">
        <h2>AI advisor <span class="chain-meta">(${esc(ai.confidence)} · suggests ${esc(ai.suggestedDecision)})</span></h2>
        <div class="section-body">
          <p class="verdict-value" style="font-size:1.1rem">${esc(ai.headline)}</p>
          <p class="reason">${esc(ai.narrative)}</p>
          ${ai.scoreEvaluation ? `<p class="field-label">Score evaluation</p><p class="reason">${esc(ai.scoreEvaluation)}</p>` : ""}
          ${ai.whatCouldGoWrong && ai.whatCouldGoWrong.length ? `<p class="field-label">What could go wrong</p>${listItems(ai.whatCouldGoWrong)}` : ""}
          ${ai.whyContinueMightBeOk && ai.whyContinueMightBeOk.length ? `<p class="field-label">When continue might still be OK</p>${listItems(ai.whyContinueMightBeOk)}` : ""}
          ${ai.questionsForHuman && ai.questionsForHuman.length ? `<p class="field-label">Questions for you</p>${listItems(ai.questionsForHuman)}` : ""}
        </div>
      </section>`
    : `<section class="section"><div class="section-body"><p class="chain-meta">No AI briefing (disabled, skipped, or errored). Rule-based score above still applies.</p></div></section>`;

  const decision = a.humanDecision;
  const decisionHtml = decision
    ? `<section class="verdict-card ${decision.decision === "ABORT" ? "detected" : "safe"}">
        <p class="verdict-label">Human decision recorded</p>
        <p class="verdict-value">${esc(decision.decision)}</p>
        <p class="reason">${esc(decision.note || "")} · ${esc((decision.decidedAt || "").slice(0, 19))}</p>
      </section>`
    : `<section class="section human-decision">
        <h2>Your decision</h2>
        <div class="section-body">
          <p class="reason">Engine recommendation: <strong>${esc(a.recommendation)}</strong>. You must choose before treating this as cleared.</p>
          <label class="field-label" for="pretx-note">Note (optional)</label>
          <input id="pretx-note" type="text" placeholder="Why you continue or abort…" />
          <div class="row paste-actions" style="margin-top:0.75rem">
            <button type="button" class="danger" id="pretx-abort-btn">Abort</button>
            <button type="button" class="ok" id="pretx-continue-btn">Continue</button>
          </div>
          <p class="hint">Logged to <code>data/tx_risk_decisions.json</code>. This app never broadcasts the transaction.</p>
        </div>
      </section>`;

  resultsEl.hidden = false;
  resultsEl.innerHTML = `
    <section class="verdict-card ${riskLevelClass(a.riskLevel)}">
      <p class="verdict-label">Pre-transaction risk</p>
      <p class="verdict-value">${esc(a.riskLevel)} · ${esc(a.riskScore)}/100</p>
      <p class="reason">${esc(a.summary)} Engine suggests <strong>${esc(a.recommendation)}</strong>.</p>
    </section>
    <div class="meta-grid">
      ${metaItem("Assessment id", a.id)}
      ${metaItem("Network", `${a.network} (${a.chainId})`)}
      ${metaItem("From", a.draft.from || "—")}
      ${metaItem("To", a.draft.to)}
      ${metaItem("Value", `${a.draft.valueEth} ETH`)}
      ${metaItem("Selector", a.draft.selector || "—")}
      ${metaItem("Ledger hit", a.ledgerHit ? "yes" : "no")}
      ${metaItem("On-chain balance", a.onChain && a.onChain.ok ? `${a.onChain.ethBalance} ETH` : (a.onChain && a.onChain.error) || "n/a")}
      ${metaItem("Has code", a.onChain && a.onChain.ok ? String(a.onChain.hasCode) : "n/a")}
    </div>
    <section class="section">
      <h2>Risk factors</h2>
      <div class="section-body risk-factors">${factors || '<p class="chain-meta">None</p>'}</div>
    </section>
    ${aiHtml}
    ${decisionHtml}
  `;

  const abortBtn = document.getElementById("pretx-abort-btn");
  const contBtn = document.getElementById("pretx-continue-btn");
  if (abortBtn) abortBtn.addEventListener("click", () => submitPretxDecision("ABORT"));
  if (contBtn) contBtn.addEventListener("click", () => submitPretxDecision("CONTINUE"));
}

async function submitPretxDecision(decision) {
  const id = lastPretxAssessmentId;
  if (!id) {
    setStatus("No assessment id — run Assess again", true);
    return;
  }
  const noteEl = document.getElementById("pretx-note");
  const note = noteEl ? noteEl.value.trim() : "";
  setBusy(true);
  setStatus(`Recording ${decision}…`);
  try {
    const res = await fetch("/api/tx-risk/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessmentId: id, decision, note })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    setStatus(`Human decision: ${decision}`);
    renderPretx({ assessment: data.assessment });
  } catch (err) {
    setStatus(err.message || "Decision failed", true);
  } finally {
    setBusy(false);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (mode === "registry") {
    loadRegistry();
    return;
  }
  resultsEl.hidden = true;
  resultsEl.innerHTML = "";
  setBusy(true);

  try {
    if (mode === "pretx") {
      const network = document.getElementById("pretx-network").value;
      const to = document.getElementById("pretx-to").value.trim();
      const from = document.getElementById("pretx-from").value.trim();
      const valueEth = document.getElementById("pretx-value").value.trim() || "0";
      const data = document.getElementById("pretx-data").value.trim() || "0x";
      const withAi = document.getElementById("pretx-with-ai").checked;
      if (!to) throw new Error("Destination `to` address is required");
      setStatus("Assessing draft transaction against ledger…");
      const res = await fetch("/api/tx-risk/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network, to, from: from || undefined, valueEth, data, withAi })
      });
      const dataOut = await res.json();
      if (!res.ok) throw new Error(dataOut.error || `Request failed (${res.status})`);
      lastPretxAssessmentId = dataOut.assessment && dataOut.assessment.id;
      const aiNote =
        dataOut.ai && dataOut.ai.skipped && dataOut.ai.reason && dataOut.ai.reason !== "not requested"
          ? ` (AI: ${dataOut.ai.reason})`
          : "";
      setStatus(
        `Pre-tx risk ${dataOut.assessment.riskLevel} (${dataOut.assessment.riskScore}/100) · engine suggests ${dataOut.assessment.recommendation}${aiNote}`
      );
      renderPretx(dataOut);
      return;
    }

    if (mode === "dataset") {
      const file = datasetFileEl.files && datasetFileEl.files[0];
      if (!file) throw new Error("Choose a JSON dataset file first");

      const maxMb = 64;
      if (file.size > maxMb * 1024 * 1024) {
        throw new Error(
          `File is ${Math.round(file.size / 1024 / 1024)}MB (limit ~${maxMb}MB). Split the JSON or use a smaller export.`
        );
      }

      setStatus(`Reading ${file.name} (${Math.round(file.size / 1024)} KB)…`);
      const text = await readFileAsText(file);
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error("File is not valid JSON");
      }

      const rows = Array.isArray(payload)
        ? payload
        : payload && typeof payload === "object"
          ? payload.transactions || payload.rows || payload.data || payload.main_transactions || null
          : null;
      if (!rows || !Array.isArray(rows)) {
        throw new Error(
          "Dataset must be a JSON array, or an object with transactions/rows/data array."
        );
      }
      if (!rows.length) throw new Error("Dataset is empty");

      // Batch so large files don't hit body limits / Cloudflare 502 timeouts
      const batchSize = 25;
      const merged = {
        summary: {
          total: 0,
          datasetTotal: rows.length,
          offset: 0,
          limit: rows.length,
          truncated: false,
          byVerdict: {},
          flaggedCount: 0
        },
        flagged: [],
        results: [],
        riskRegistryUpdates: []
      };

      for (let offset = 0; offset < rows.length; offset += batchSize) {
        const chunk = rows.slice(offset, offset + batchSize);
        setStatus(
          `Analyzing dataset… ${Math.min(offset + chunk.length, rows.length)}/${rows.length}`
        );
        let res;
        try {
          res = await fetch("/api/analyze-dataset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dataset: chunk,
              network: networkEl.value,
              limit: chunk.length,
              offset: 0
            })
          });
        } catch (netErr) {
          throw new Error(
            `Failed to reach server while analyzing rows ${offset + 1}–${offset + chunk.length}. ` +
              `If using the public tunnel, try localhost instead for large files. (${netErr.message || "network error"})`
          );
        }
        const rawText = await res.text();
        let data;
        try {
          data = JSON.parse(rawText);
        } catch {
          throw new Error(
            res.status === 502
              ? "Cloudflare timed out (502) — dataset too large/slow for the public tunnel. Use http://localhost:3857 for big JSON files."
              : `Server returned non-JSON (${res.status}): ${rawText.slice(0, 120)}`
          );
        }
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

        for (const r of data.results || []) {
          merged.results.push({ ...r, index: offset + (r.index || 0) });
        }
        for (const f of data.flagged || []) {
          merged.flagged.push({ ...f, index: offset + (f.index || 0) });
        }
        if (data.riskRegistryUpdates) {
          merged.riskRegistryUpdates.push(...data.riskRegistryUpdates);
        }
        for (const [k, v] of Object.entries((data.summary && data.summary.byVerdict) || {})) {
          merged.summary.byVerdict[k] = (merged.summary.byVerdict[k] || 0) + v;
        }
      }

      merged.summary.total = merged.results.length;
      merged.summary.flaggedCount = merged.flagged.length;
      lastDataset = merged;
      const regN = (merged.riskRegistryUpdates || []).length;
      setStatus(
        `Done — ${merged.summary.total} txs, ${merged.summary.flaggedCount} REENTRANCY_DETECTED` +
          (regN ? `, ${regN} registry update(s)` : "")
      );
      renderDataset(merged);
      return;
    }

    const body =
      mode === "paste"
        ? { format2: format2El.value }
        : { txHash: input.value.trim(), network: networkEl.value };

    setStatus(
      mode === "paste"
        ? "Running detector on pasted format2…"
        : `Fetching format2 on ${networkEl.value} and running detector…`
    );

    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    const reg = data.riskRegistry && data.riskRegistry.contract;
    setStatus(
      data.detection.verdict === "REENTRANCY_DETECTED"
        ? `Reentrancy detected${reg ? ` — registry ${reg.riskLevel} (${reg.riskScore}/100)` : ""}.`
        : `Done — ${data.detection.verdict}` + (data.detection.reason ? ` (${data.detection.reason})` : "")
    );
    resultsEl.hidden = false;
    resultsEl.innerHTML = render(data);
  } catch (err) {
    setStatus(err.message || "Analysis failed", true);
  } finally {
    setBusy(false);
  }
});
