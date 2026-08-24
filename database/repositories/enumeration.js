const TransactionPurpose = Object.freeze({
    MALICIOUS: "MALICIOUS",
    BENIGN: "BENIGN",
    INSTRUMENTATION: "INSTRUMENTATION"
});

const AccountRole = Object.freeze({
    ATTACKER: "ATTACKER",
    VICTIM: "VICTIM",
    NEUTRAL: "NEUTRAL",
    VICTIM_AND_ATTACKER: "VICTIM&ATTACKER"
});

const ParticipationType = Object.freeze({
    FROM: "FROM",
    TO: "TO",
    OTHER: "OTHER"
});

module.exports = {
    TransactionPurpose,
    AccountRole,
    ParticipationType
};