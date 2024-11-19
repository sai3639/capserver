/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async knex => {
    await knex.schema.createTable('voltages', tbl => {
        tbl.increments();
        tbl.text('message', 256).notNullable();
        tbl.integer('volt').notNullable(); // Ensure this line is present
        tbl.timestamp('created_at').defaultTo(knex.fn.now());
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async knex => {
    await knex.schema.dropTableIfExists('voltages');
};
