
require('dotenv').config();  


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


  production:{
    client: 'mysql2',
    connection: {
      host: 'aws.connect.psdb.cloud',
      user: 'tp3pmkuhaol9dvwlcupf',
      password: 'pscale_pw_oTuAxwFOH8XtECNGyhICIRPMdUa9FiyHqh4LNbPKpjR',
      database: 'groundcontrol',
      ssl: { rejectUnauthorized: true }
    },
    migrations: {
      directory: './api/migrations'
    },

    seeds:{
      directory: './api/seeds'
    }
  }

  
};
