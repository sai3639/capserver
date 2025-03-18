/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  await knex('power').truncate();//deletes all rows from power table but keeps table stucture
  await knex('power').insert([
      { message: "Initial power reading", watt: 5 },//insert message, watt 
      { message: "Initial power reading", watt: 8 },
  ]);
};
