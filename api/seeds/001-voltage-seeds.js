/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('voltages').truncate()
  await knex('voltages').insert([//add entry
    {
      //testt values
      message: "fdfdf",//,essage
      volt: 1, //voltage number
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
