/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async knex => {
    //createm table logs
    await knex.schema.createTable('logs', tbl => {
        tbl.increments();//id
        tbl.text('callsign').notNullable();//callsgin
        tbl.text('telemetry_data').notNullable();//message
        tbl.timestamp('created_at').defaultTo(knex.fn.now());//time
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
//drop table
exports.down = async knex => {
    await knex.schema.dropTableIfExists('logs');
  
};
