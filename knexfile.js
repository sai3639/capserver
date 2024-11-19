// Update with your config settings.

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
module.exports = {

  development: {
    client: 'sqlite3',
    connection: {
      filename: './api/voltages.db3'
    },

    migrations:{
      directory: './api/migrations'
    },
    seeds: {
      directory: "./api/seeds"
    },
    useNullAsDefault: true, 

  },

  
};
