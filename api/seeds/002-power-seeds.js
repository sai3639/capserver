/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  await knex('power').truncate();
  await knex('power').insert([
      { message: "Initial power reading", watt: 5 },
      { message: "Initial power reading", watt: 8 },
  ]);
};
