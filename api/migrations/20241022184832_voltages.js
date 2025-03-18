/**
 * @param { import("knex").Knex } knex //knex paramater is of type knex
 * @returns { Promise<void> }//function returns a promise - once promise resolves no value returned 
 */

//exports up migration function
//responsible for making changes to database schema
exports.up = async knex => {
    //creates table named voltages
    await knex.schema.createTable('voltages', tbl => {
        tbl.increments(); //auto-incrementing inter primary key (id)
        tbl.text('message', 256).notNullable();//creates message max length 256 characters - cant be null
        tbl.integer('volt').notNullable(); // creat vol column - integer - cant be null
        tbl.timestamp('created_at').defaultTo(knex.fn.now());//creates timestamp - defaults to current timestamp
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

//down - reverts changes made by up
exports.down = async knex => {
    //drops/deletes voltages table from databse
    //ensures table is dropped if it exists 
    await knex.schema.dropTableIfExists('voltages');
};
