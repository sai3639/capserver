/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async knex =>  {
    await knex.schema.createTable('power', tbl => {
        tbl.increments();
        tbl.text('message', 256).notNullable();
        tbl.integer('watt').notNullable();
        tbl.timestamp('created_at').defaultTo(knex.fn.now());
    });
  
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async knex => {
    await knex.schema.dropTableIfExists('power');
  
};
