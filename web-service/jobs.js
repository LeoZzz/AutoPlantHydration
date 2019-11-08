const cron = require('node-cron')
const db = require('./db')
const Push = require('pushover-notifications')
const subMilliseconds = require('date-fns/subMilliseconds')
const isAfter = require('date-fns/isAfter')
const isBefore = require('date-fns/isBefore')

const LIGHT_THRESHOLD = 250
const MOISTURE_THRESHOLD = 250

function moistureLevel(m) {
  if (m > MOISTURE_THRESHOLD * 2) {
    return "hydrated"
  } else if (m <= MOISTURE_THRESHOLD * 2 && m > MOISTURE_THRESHOLD) {
    return "needs water soon"
  } else if (m < MOISTURE_THRESHOLD) {
    return "needs water now"
  }
}

function lightLevel(l) {
  if (l > LIGHT_THRESHOLD * 2) {
    return "bright"
  } else if (l <= LIGHT_THRESHOLD * 2 && l > LIGHT_THRESHOLD) {
    return "dim"
  } else if (l < LIGHT_THRESHOLD) {
    return "dark"
  }
}

function sendPushoverMessage({ message, title } = {}) {
  const pushover = new Push({
    user: process.env.PUSHOVER_USER,
    token: process.env.PUSHOVER_TOKEN
  })

  const pushoverMessage = {
    message,
    title,
    priority: 1
  }

  pushover.send(pushoverMessage, (err, result) => {
    if (err) {
      throw err
    }
    console.log(result)
  })
}

function avgSensorDataLastMinute() {
  // sensor data from the past minute
  const sensorData = db.get('sensorData')
    .value()
    .filter(data => isBefore(subMilliseconds(new Date(), 60000), new Date(data.timestamp)))

  // sum light sensor values
  let sensorLightSum = 0
  sensorData.forEach(({ light }) =>
    sensorLightSum += light
  )

  // sum moisture sensor values
  let sensorMoistureSum = 0
  sensorData.forEach(({ moisture }) =>
    sensorMoistureSum += moisture
  )

  // take the average of both sensor sums
  // is either return NaN (no data found), return 0 by default
  return {
    avgSensorLight: Math.round(sensorLightSum / sensorData.length) || 0,
    avgSensorMoisture: Math.round(sensorMoistureSum / sensorData.length) || 0
  }
}

function avgSensorDataLastHour() {
  // sensor data from the past hour
  let sensorData = db.get('sensorData').value()
  sensorData = sensorData.filter(data =>
    isBefore(subMilliseconds(new Date(), 3600000), new Date(data.timestamp))
  )

  // sum light sensor values
  let sensorLightSum = 0
  sensorData.forEach(({ light }) =>
    sensorLightSum += light
  )

  // sum moisture sensor values
  let sensorMoistureSum = 0
  sensorData.forEach(({ moisture }) =>
    sensorMoistureSum += moisture
  )

  // take the average of both sensor sums
  // is either return NaN (no data found), return 0 by default
  return {
    avgSensorLight: Math.round(sensorLightSum / sensorData.length) || 0,
    avgSensorMoisture: Math.round(sensorMoistureSum / sensorData.length) || 0
  }
}

function hourlyUpdate() {
  const { avgSensorLight, avgSensorMoisture } = avgSensorDataLastHour()
  console.log("TCL: hourlyUpdate -> avgSensorLight, avgSensorMoisture", avgSensorLight, avgSensorMoisture)
  const lightLevelMessage = `Average Light Level: ${lightLevel(avgSensorLight)}`
  const moistureLevelMessage = `Average Moisture Level: ${moistureLevel(avgSensorMoisture)}`

  sendPushoverMessage({
    message: `${lightLevelMessage}<br>${moistureLevelMessage}`,
    title: 'Auto Plant Hydration - Hourly Update'
  })
}

function criticalUpdate() {
  const { avgSensorLight, avgSensorMoisture } = avgSensorDataLastMinute
  const notifiedLowLight = db.get('notifiedLowLight').value()
  const notifiedLowMoisture = db.get('notifiedLowMoisture').value()

  let message = ''

  if (avgSensorMoisture < MOISTURE_THRESHOLD && notifiedLowMoisture === 0) {
    message += 'Warning - Low Moisture Level<br>'
    db.set('notifiedLowMoisture', true).write()
  } else if (avgSensorMoisture >= MOISTURE_THRESHOLD && notifiedLowMoisture === 1) {
    message += 'Update - Moisture Level Adequate<br>'
    db.set('notifiedLowMoisture', false).write()
  }

  if (avgSensorLight < LIGHT_THRESHOLD && notifiedLowLight === 0) {
    message += 'Warning - Low Light Level<br>'
    db.set('notifiedLowLight', true).write()
  } else if (avgSensorLight >= LIGHT_THRESHOLD && notifiedLowLight === 1) {
    message += 'Update - Light Level Adequate<br>'
    db.set('notifiedLowLight', false).write()
  }

  if (message.length > 0) {
    sendPushoverMessage({
      message,
      title: 'Auto Plant Hydration - Critical Update'
    })
  }
  console.log('No message to send')
}

// hourly update of current status of plant
cron.schedule('* * * * *', hourlyUpdate);

// notify user of critical level changes (too low, or back to adequate)
cron.schedule('* * * * *', criticalUpdate);
