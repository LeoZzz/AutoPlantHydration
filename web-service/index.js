const bodyParser = require('body-parser')
const cors = require('cors')
const express = require('express')
const format = require('date-fns/format')
require('dotenv').config()

const routes = require('./routes')
const db = require('./db')
require('./jobs')

const WebService = express()

WebService.use(cors({
  origin: function (_, callback) {
    callback(null, true)
  },
  credentials: true,
  optionsSuccessStatus: 200
}))

WebService.options('*', cors())
WebService.use(bodyParser.json())
WebService.use(bodyParser.urlencoded({ extended: true }))
WebService.set('view engine', 'pug')

WebService.get('/', (req, res) => {
  const sensorData = db.get('sensorData').value()
  res.render('index', { format, sensorData })
})
WebService.use('/api', routes)

WebService.listen(3000, () => console.log('Application is now running on port 3000'))
