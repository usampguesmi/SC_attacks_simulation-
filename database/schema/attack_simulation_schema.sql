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
    'INSTRUMENTATION'
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
    simulation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY , 
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

    CREATE TABLE transaction_record(
        tx_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY , 
        tx_value  NUMERIC(78,0), 
        block_number BIGINT, 
        tx_timestamp TIMESTAMPTZ, 
        gas_used BIGINT,
        traces_length BIGINT, 

        opcode_traces TEXT,
        opcode_stack_traces TEXT,
        full_evm_exec_traces JSONB, 

        simulation_id BIGINT NOT NULL, 

        from_address VARCHAR(50) NOT NULL,
        fromAddress_chain_id BIGINT NOT NULL, 

        to_address VARCHAR(50) NOT NULL, 
        toAddress_chain_id BIGINT NOT NULL,
        geth_traces TEXT, 

        CONSTRAINT tk_transactionRecord_simulation
            FOREIGN KEY (simulation_id)
            REFERENCES simulation(simulation_id),
        
        CONSTRAINT fk_transaction_from_account
            FOREIGN KEY (
            from_address,
            fromAddress_chain_id
            )
            REFERENCES account(
            account_address,
            chain_id
            ),

        CONSTRAINT fk_transaction_to_account
            FOREIGN KEY (
            to_Address,
            toAddress_chain_id
            )
            REFERENCES account(
            account_address,
            chain_id
            ),

); 

CREATE TABLE main_transaction (
    tx_id             BIGINT PRIMARY KEY,

    tx_hash              VARCHAR(66) NOT NULL,
    chain_id          BIGINT NOT NULL,

    index_in_block    INTEGER,
    tx_status            BOOLEAN,
    transaction_purpose transaction_purpose_enum,

    CONSTRAINT fk_main_transaction_parent
        FOREIGN KEY (tx_id)
        REFERENCES transaction_record(tx_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_main_transaction_network
        FOREIGN KEY (chain_id)
        REFERENCES blockchain_network(chain_id),

    CONSTRAINT uq_main_transaction_hash
        UNIQUE (chain_id, tx_hash)
);

CREATE TABLE internal_transaction (
    tx_id                 BIGINT PRIMARY KEY,

    call_depth                 INTEGER,
    call_type             VARCHAR(50),
    call_index          INTEGER,

    start_opcode_index    BIGINT,
    end_opcode_index      BIGINT,

    main_tx_id            BIGINT NOT NULL,

    CONSTRAINT fk_internal_transaction_parent
        FOREIGN KEY (tx_id)
        REFERENCES transaction_record(tx_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_internal_transaction_main
        FOREIGN KEY (main_tx_id)
        REFERENCES main_transaction(tx_id)
        ON DELETE CASCADE,

    CONSTRAINT chk_internal_opcode_indexes
        CHECK (
            start_opcode_index IS NULL
            OR end_opcode_index IS NULL
            OR start_opcode_index <= end_opcode_index
        )
);


CREATE TABLE evm_traces (
    tx_id               BIGINT NOT NULL,
    opcode_index        BIGINT NOT NULL,

    pc                   BIGINT,
    opcode_name          VARCHAR(100),
    opcode_depth                INTEGER,
    opcode_category      VARCHAR(100),

    memory               INTEGER,
    stack                INTEGER,
    storage              INTEGER,

    PRIMARY KEY (tx_id, opcode_index),

    CONSTRAINT fk_evm_trace_transaction
        FOREIGN KEY (tx_id)
        REFERENCES transaction_record(tx_id)
        ON DELETE CASCADE
);

CREATE TABLE role_account (
    tx_id                BIGINT NOT NULL,

    account_address      VARCHAR(50) NOT NULL,
    chain_id             BIGINT NOT NULL,

    participation_type   participation_type_enum NOT NULL,
    role_account         account_role_enum NOT NULL,

    balance_before_tx    NUMERIC(78, 0),
    balance_after_tx     NUMERIC(78, 0),

    function_selector    VARCHAR(10),

    PRIMARY KEY (
        tx_id,
        account_address,
        chain_id,
        participation_type
    ),

    CONSTRAINT fk_role_account_transaction
        FOREIGN KEY (tx_id)
        REFERENCES transaction_record(tx_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_role_account_account
        FOREIGN KEY (account_address, chain_id)
        REFERENCES account(account_address, chain_id)
        ON DELETE CASCADE
)






