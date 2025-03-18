
/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
module.exports = { //exports object

  //key for development enviornment config
  development: {
    client: 'sqlite3', //using sqlie database client for knex
    connection: {//defines connectiton settins for database
      filename: './api/voltages.db3'//path and filename for sqlite databsefile
    },

    migrations:{//migrations settings 0 modify database schema over time
      directory: './api/migrations' //directory where migratoin files are stored
    },
    seeds: {//seedsss - used to populate database w test data
      directory: "./api/seeds" //directory
    },
    useNullAsDefault: true, //use null as default value for columns when no value provided

  },

  
};
