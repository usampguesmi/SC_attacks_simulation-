-- Vulnerable-contract risk registry (populated by the analyzer UI agent).
-- Run once: psql "$DB_NAME" -f database/schema/vulnerable_contract_registry.sql

CREATE TABLE IF NOT EXISTS vulnerable_contract (
    contract_address   VARCHAR(50) NOT NULL,
    chain_id           BIGINT NOT NULL,
    network_name       VARCHAR(50),
    attack_name        VARCHAR(100) NOT NULL DEFAULT 'sf_reentrancy',
    first_detected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_detected_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    total_stolen_wei   NUMERIC(78, 0) NOT NULL DEFAULT 0,
    exploit_count      INT NOT NULL DEFAULT 0,
    max_reentrancy_count INT NOT NULL DEFAULT 0,
    unique_attacker_count INT NOT NULL DEFAULT 0,
    risk_score         INT NOT NULL DEFAULT 0,
    risk_level         VARCHAR(20) NOT NULL DEFAULT 'LOW',
    risk_factors       JSONB NOT NULL DEFAULT '[]'::jsonb,
    PRIMARY KEY (contract_address, chain_id)
);

CREATE TABLE IF NOT EXISTS contract_exploit (
    exploit_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    contract_address   VARCHAR(50) NOT NULL,
    chain_id           BIGINT NOT NULL,
    tx_hash            VARCHAR(70) NOT NULL,
    network_name       VARCHAR(50),
    attack_name        VARCHAR(100) NOT NULL DEFAULT 'sf_reentrancy',
    block_number       BIGINT,
    tx_timestamp       TIMESTAMPTZ,
    stolen_wei         NUMERIC(78, 0) NOT NULL DEFAULT 0,
    reentrancy_count   INT,
    function_selector  VARCHAR(20),
    attacker_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
    value_per_call_wei NUMERIC(78, 0),
    detection_detail   JSONB,
    detected_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_contract_exploit_tx UNIQUE (chain_id, tx_hash),
    CONSTRAINT fk_contract_exploit_victim
        FOREIGN KEY (contract_address, chain_id)
        REFERENCES vulnerable_contract(contract_address, chain_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vulnerable_contract_risk
    ON vulnerable_contract (risk_score DESC);

CREATE INDEX IF NOT EXISTS idx_contract_exploit_contract
    ON contract_exploit (contract_address, chain_id, detected_at DESC);
