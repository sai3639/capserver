const knex = require('knex'); //imports knex librar
//knex - sql query builder for node.js 
//allows to interact w daabases using javascript api



const knexfile = require('../knexfile'); //imports database configuration from knexfile.js file
//

const enviornment = process.env.NODE_ENV || 'production'; //switch from using sqlite in development and mysql in "production"
const config = knexfile[enviornment]; //which environment to configure the server in -- developent v production

//creates knex instance 
const db = knex(config);

module.exports = db; 

