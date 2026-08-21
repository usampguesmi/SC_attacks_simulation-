INSERT INTO attack (
    attack_name,
    attack_category,
    attack_variant,
    attack_description
)
VALUES (
    'sf_reentrancy',
    'Reentrancy',
    'Single-function',
    'A reentrancy attack in which the attacker repeatedly re-enters the same vulnerable function before the previous invocation has completed.'
);

SELECT *
FROM attack;