/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async knex =>  {
    //create table telemetry 
    await knex.schema.createTable('telemetry', tbl => {
        tbl.increments();//iid
        tbl.text('message', 256).notNullable();//message
        tbl.binary('binary_data');
        tbl.text('plot_path').nullable();//plot
        tbl.timestamp('created_at').defaultTo(knex.fn.now());//timestamp
    });
  
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
//delete table
exports.down = async knex => {
    await knex.schema.dropTableIfExists('telemetry');
  
};
