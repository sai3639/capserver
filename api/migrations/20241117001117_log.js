/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async knex => {
    await knex.schema.createTable('logs', tbl => {
        tbl.increments();
        tbl.text('callsign').notNullable();
        tbl.text('telemetry_data').notNullable();
        tbl.timestamp('created_at').defaultTo(knex.fn.now());
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async knex => {
    await knex.schema.dropTableIfExists('logs');
  
};
