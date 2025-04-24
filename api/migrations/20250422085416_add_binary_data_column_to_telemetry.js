exports.up = function(knex) {
    return knex.schema.alterTable('telemetry', table => {
      table.binary('binary_data'); //binary data to display on frontend stored here - mysql
    });
  };
  
  exports.down = function(knex) {
    return knex.schema.alterTable('telemetry', table => {
      table.dropColumn('binary_data');
    });
  };
  