exports.up = function(knex) {
  return knex.schema.hasColumn('telemetry', 'binary_data').then(function(exists) {
    if (!exists) {
      return knex.schema.table('telemetry', function(table) {
        table.binary('binary_data');
      });
    }
  });
};

exports.down = function(knex) {
  return knex.schema.table('telemetry', function(table) {
    table.dropColumn('binary_data');
  });
};
