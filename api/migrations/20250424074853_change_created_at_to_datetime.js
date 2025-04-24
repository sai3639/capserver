exports.up = function(knex) {
    return knex.schema.alterTable('telemetry', function(table) {
      table.datetime('created_at').alter();
    });
  };
  
  exports.down = function(knex) {
    return knex.schema.alterTable('telemetry', function(table) {
      table.timestamp('created_at').alter();
    });
  };
  
