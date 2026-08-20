-- ============================================================
-- BLOCKCHAIN NETWORK DATA
-- ============================================================


-- Ethereum Mainnet
INSERT INTO blockchain_network (
    chain_id,
    network_name,
    network_type
)
VALUES (
    1,
    'Ethereum Mainnet',
    'Mainnet'
);


-- Ethereum Sepolia Testnet
INSERT INTO blockchain_network (
    chain_id,
    network_name,
    network_type
)
VALUES (
    11155111,
    'Sepolia',
    'Testnet'
);

-- Local Hardhat development network
INSERT INTO blockchain_network (
    chain_id,
    network_name,
    network_type
)
VALUES (
    31337,
    'Hardhat',
    'Local'
);

SELECT *
FROM blockchain_network;




