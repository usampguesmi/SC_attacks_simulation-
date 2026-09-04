CREATE TYPE participation_type_enum AS ENUM (
    'FROM',
    'TO',
    'OTHER'
);

CREATE TYPE account_role_enum AS ENUM (
    'ATTACKER',
    'VICTIM',
    'NEUTRAL',
    'VICTIM_AND_ATTACKER'
);

CREATE TYPE transaction_purpose_enum AS ENUM (
    'MALICIOUS',
    'BENIGN',
    'INSTRUMENTATION',
    'INTERNAL'
);

CREATE TYPE transac_type_enum AS ENUM (
    'MAIN',
    'INTERNAL'
);

CREATE TABLE blockchain_network (
    chain_id BIGINT PRIMARY KEY,
    network_name VARCHAR(100) NOT NULL,
    network_type VARCHAR(100)
);

CREATE TABLE Attack (
    attack_name VARCHAR(100) PRIMARY KEY,
    attack_category VARCHAR(100), 
    attack_variant VARCHAR(100),
    ATTACK_description TEXT
    );

CREATE TABLE Simulation(
    simulation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, 
    solidity_version VARCHAR(50), 
    environment VARCHAR(100),
    environment_version VARCHAR(50),
    evm_hardfork VARCHAR(50),
    chain_id  BIGINT NOT NULL , 
    attack_name VARCHAR(150) NOT NULL,

    CONSTRAINT fk_simulation_network
        FOREIGN KEY (chain_id)
        REFERENCES blockchain_network(chain_id),
    
    CONSTRAINT fk_simulation_attack
        FOREIGN KEY (attack_name)
        REFERENCES attack(attack_name)
);

CREATE TABLE Account (
    account_address VARCHAR(50), 
    chain_id BIGINT NOT NULL, 

    PRIMARY KEY (account_address, chain_id ),
    
    CONSTRAINT fk_account_network 
        FOREIGN KEY (chain_id)
        REFERENCES blockchain_network(chain_id)
    );

CREATE TABLE EOA (
    account_address VARCHAR(50) NOT NULL , 
    chain_id BIGINT NOT NULL , 
    publicKey VARCHAR(200),

   PRIMARY KEY (account_address, chain_id ),
   
   CONSTRAINT fk_EOA_account
        FOREIGN KEY (account_address,chain_id)
        REFERENCES account(account_address,chain_id)
        ON DELETE CASCADE
    );

CREATE TABLE SmartContract (
    account_address VARCHAR(50) NOT NULL , 
    chain_id BIGINT NOT NULL,
    scontract_name VARCHAR(50),
    bytecode TEXT, 
    solidity_code TEXT,
    blockNumber_deployment BIGINT,
    tx_hash_deployment VARCHAR(70) , 
    timestamp_deployment TIMESTAMPTZ,
    creator_address  VARCHAR(50), 
    creator_chain_id  BIGINT, 

    PRIMARY KEY (account_address, chain_id ),

    CONSTRAINT fk_smartContract_account
        FOREIGN KEY (account_address,chain_id)
        REFERENCES account(account_address,chain_id)
        ON DELETE CASCADE,
    
    CONSTRAINT fk_smartContract_creator
        FOREIGN KEY (creator_address,creator_chain_id)
        REFERENCES account(account_address,chain_id)
);

CREATE TABLE main_transaction (
     tx_id BIGINT GENERATED ALWAYS AS IDENTITY, 
     tx_hash  VARCHAR(70) NOT NULL,
     tx_value  NUMERIC(78,0), 
     block_number BIGINT, 
     index_inBlock  INT,
     tx_timestamp TIMESTAMPTZ,
     tx_status    BOOLEAN, 
     gas_used BIGINT,
     transaction_purpose transaction_purpose_enum,

     traces_length BIGINT, 
     opcode_traces TEXT,
     opcode_stack_traces TEXT,
     full_evm_exec_traces JSONB, 
    
     simulation_id BIGINT NOT NULL, 

    from_address VARCHAR(50),
    fromAddress_chain_id BIGINT, 

    to_address VARCHAR(50), 
    toAddress_chain_id BIGINT,
    
    chain_id          BIGINT,

    PRIMARY KEY (tx_id, tx_hash,  chain_id ),

    CONSTRAINT fk_main_transaction_network
        FOREIGN KEY (chain_id)
        REFERENCES blockchain_network(chain_id),

    CONSTRAINT uq_main_transaction_hash
        UNIQUE (chain_id, tx_hash),

    CONSTRAINT fk_main_transaction_simulation
         FOREIGN KEY (simulation_id)
         REFERENCES simulation(simulation_id),
    
    CONSTRAINT fk_main_transaction_from_account
         FOREIGN KEY (from_address, fromAddress_chain_id)
         REFERENCES account(account_address, chain_id),

     CONSTRAINT fk_main_transaction_to_account
         FOREIGN KEY (to_address, toAddress_chain_id)
         REFERENCES account(account_address, chain_id)
);

CREATE TABLE internal_transaction (
    tx_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    main_tx_id BIGINT NOT NULL,
    hash_tx    VARCHAR(70) NOT NULL,
    chain_id   BIGINT NOT NULL,

    call_order         INT NOT NULL,
    call_depth         INT,
    call_type          VARCHAR(20),
    call_index         INT,
    start_opcode_index INT,
    end_opcode_index   INT,
    call_status        BOOLEAN,

    tx_value             NUMERIC(78,0),
    gas_used             BIGINT,
    traces_length        BIGINT,
    opcode_traces        TEXT,
    opcode_stack_traces  TEXT,
    full_evm_exec_traces JSONB,

    from_address          VARCHAR(50),
     fromAddress_chain_id  BIGINT,

    to_address            VARCHAR(50),
    toAddress_chain_id    BIGINT,


     CONSTRAINT fk_internal_transaction_main
         FOREIGN KEY (main_tx_id, chain_id, hash_tx)
         REFERENCES main_transaction(tx_id, chain_id, tx_hash),

    CONSTRAINT fk_internal_transaction_from_account
         FOREIGN KEY (from_address, fromAddress_chain_id)
         REFERENCES account(account_address, chain_id),

     CONSTRAINT fk_internal_transaction_to_account
         FOREIGN KEY (to_address, toAddress_chain_id)
         REFERENCES account(account_address, chain_id),

     CONSTRAINT uq_internal_transaction_order
         UNIQUE (main_tx_id, chain_id, hash_tx, call_order)
);

CREATE TABLE role_account (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    main_tx_id           BIGINT NOT NULL,
    main_chain_id        BIGINT NOT NULL,
    main_hash_tx         VARCHAR(70) NOT NULL,

    account_address      VARCHAR(50) NOT NULL,
    chain_id             BIGINT NOT NULL,

    participation_type   participation_type_enum NOT NULL,
    role_account         account_role_enum,   -- nullable: filled in later via separate script

    balance_before_tx    NUMERIC(78, 0),
    balance_after_tx     NUMERIC(78, 0),

    function_selector    VARCHAR(10),

    CONSTRAINT fk_role_account_main
        FOREIGN KEY (main_tx_id, main_chain_id, main_hash_tx)
        REFERENCES main_transaction(tx_id, chain_id, tx_hash)
        ON DELETE CASCADE,

    CONSTRAINT fk_role_account_account
        FOREIGN KEY (account_address, chain_id)
        REFERENCES account(account_address, chain_id)
        ON DELETE CASCADE,

    CONSTRAINT uq_role_account
        UNIQUE (main_tx_id, account_address, chain_id, participation_type)
);






