const knex = require('knex'); //imports knex librar
//knex - sql query builder for node.js 
//allows to interact w daabases using javascript api



const config = require('../knexfile'); //imports database configuration from knexfile.js file
//
//creates knex instance 
const db = knex(config.development);

module.exports = db; 

