/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('table_name').del()
  await knex('table_name').insert([//insert array
    {
      id: 1, 
      message: 'Initial telemetry entry',//mess
      plot_path: '/plots/initial.png',//images
      created_at: new Date()//timestamp
  },
  {
      id: 2, 
      message: 'Secondary telemetry entry',
      plot_path: '/plots/secondary.png',
      created_at: new Date()
  }
]);
};