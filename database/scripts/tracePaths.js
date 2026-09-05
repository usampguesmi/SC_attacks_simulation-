// Shared helper for where a test script's traces get written.
// Every scenario/case gets its own folder containing exactly two
// subfolders: full/ (the whole transaction's trace, 3 formats) and
// internal/ (one callN-format* set per internal call detected).
//
// category: "malicious_scenario" | "safe_scenario" | any other grouping
// caseName: the specific test's folder name (e.g. "attack_0_check", "drainAll")
//
// Replaces the old pattern of always writing to a flat reenAttack/full and
// reenAttack/internal and then manually moving them into a case folder
// afterwards - this writes directly to the right place.
const path = require("path");

function getCaseTracePaths(category, caseName) {
    const caseDir = path.join(__dirname, "../../traces_tests/reenAttack", category, caseName);
    return {
        outputDir1: path.join(caseDir, "full"),
        filePrefix1: caseName,
        baseOutputDir: caseDir,
        folderName: "internal"
    };
}

module.exports = { getCaseTracePaths };
