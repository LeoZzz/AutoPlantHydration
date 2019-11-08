const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')

const adapter = new FileSync('db.json')
const db = low(adapter)

// required if JSON file is empty
db.defaults({
  sensorData: [],
  statusChecks: 0,
  notifiedLowLight: 0,
  notifiedLowMoisture: 0
}).write()

module.exports = db
