const pool = require("../db");

async function createAttack(
    attackName,
    attackCategory,
    attackVariant,
    attackDescription
) {
    const query = `
        INSERT INTO attack (
            attack_name,
            attack_category,
            attack_variant,
            attack_description
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (attack_name)
        DO NOTHING;
    `;

    const values = [
        attackName,
        attackCategory,
        attackVariant,
        attackDescription
    ];

    await pool.query(query, values);
}

module.exports = {
    createAttack
};