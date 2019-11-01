const routes = require('express').Router();
const db = require('./db')

routes.get('/status', async (req, res) => {
  db.update('statusChecks', n => n + 1).write()
  const statusChecks = db.get('statusChecks')
  res.json({
    message: 'Service Online',
    statusChecks
  });
});

routes.post('/sensor-data', async (req, res) => {
  const { moisture1, moisture2, humidity, light, temp } = req.body
  db.get('sensorData')
    .push({ moisture1, moisture2, humidity, light, temp, timestamp: new Date() })
    .write()
  res.json({
    status: 'Success',
  });
})

module.exports = routes;
