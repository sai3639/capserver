/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async knex =>  {
    //create power table
    await knex.schema.createTable('power', tbl => {
        tbl.increments();//id
        tbl.text('message', 256).notNullable();//message
        tbl.integer('watt').notNullable();//wattage
        tbl.timestamp('created_at').defaultTo(knex.fn.now());//time
    });
  
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

//drop table
exports.down = async knex => {
    await knex.schema.dropTableIfExists('power');
  
};
