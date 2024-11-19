/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('voltages').truncate()
  await knex('voltages').insert([
    {
      message: "fdfdf",
      volt: 1, 
  },
  {
      message: "rawr",
      volt: 4
  },

  {
      message: " wasr",
      volt: 3
  }, 

  {
      message: "meerwer", 
      volt: 7
  },
 

  ]);
};
