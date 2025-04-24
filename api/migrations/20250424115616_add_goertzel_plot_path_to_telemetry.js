exports.up = function(knex) {
    return knex.schema.table('telemetry', function(table) {
      // Add the 'goertzelPlotPath' column
      table.string('goertzelPlotPath');
    });
  };
  
  exports.down = function(knex) {
    return knex.schema.table('telemetry', function(table) {
      // Remove the 'goertzelPlotPath' column if rolling back
      table.dropColumn('goertzelPlotPath');
    });
  };
  