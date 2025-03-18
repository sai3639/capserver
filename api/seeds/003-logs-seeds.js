/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {//used to populate database
  // Deletes ALL existing entries
  await knex('table_name').del()
  await knex('table_name').insert([ //inerts new rows- array
    {id: 1, colName: 'rowValue1'},//how it is formatted 
    {id: 2, colName: 'rowValue2'},
    {id: 3, colName: 'rowValue3'}
  ]);
};
