const cron = require('node-cron')
const db = require('./db')
const Push = require('pushover-notifications')
const subMilliseconds = require('date-fns/subMilliseconds')
const isAfter = require('date-fns/isAfter')
const isBefore = require('date-fns/isBefore')

const LIGHT_THRESHOLD = 750
const MOISTURE_THRESHOLD = 250

function moistureLevel(m) {
  if (m >= MOISTURE_THRESHOLD) {
    return "hydrated"
  } else if (m < MOISTURE_THRESHOLD) {
    return "needs water now"
  }
}

function lightLevel(l) {
  if (l >= LIGHT_THRESHOLD) {
    return "dark"
  } else if (l < LIGHT_THRESHOLD) {
    return "bright"
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

  pushover.send(pushoverMessage, (err, { status } = {}) => {
    if (err) {
      throw err
    }
    if (status === 1) console.log("Notification sent")
  })
}

// sums light and moisture sensor data
const sensorSums = sensorData => ({
  sensorLightSum: sensorData.reduce((accumulator, { light }) => accumulator + light, 0),
  sensorMoistureSum: sensorData.reduce((accumulator, { moisture }) => accumulator + moisture, 0),
})

function getPastSensorData(timeframe) {
  const pastTimeframe = subMilliseconds(new Date(), timeframe)
  return db.get('sensorData')
    .value()
    .filter(({ timestamp }) =>
      isBefore(pastTimeframe, new Date(timestamp))
    )
}

function avgSensorDataPastTimeframe(timeframe) {
  // sensor data from the past minute
  const sensorData = getPastSensorData(timeframe)

  // sum light sensor values
  const { sensorLightSum, sensorMoistureSum } = sensorSums(sensorData)

  // take the average of both sensor sums
  // is either return NaN (no data found), return 0 by default
  return {
    avgSensorLight: Math.round(sensorLightSum / sensorData.length) || 0,
    avgSensorMoisture: Math.round(sensorMoistureSum / sensorData.length) || 0
  }
}

function hourlyUpdate() {
  const { avgSensorLight, avgSensorMoisture } = avgSensorDataPastTimeframe(3600000)
  const lightLevelMessage = `Average Light Level: ${lightLevel(avgSensorLight)}`
  const moistureLevelMessage = `Average Moisture Level: ${moistureLevel(avgSensorMoisture)}`

  console.log('Hourly update sent')
  sendPushoverMessage({
    message: `${lightLevelMessage}\n${moistureLevelMessage}`,
    title: 'Auto Plant Hydration - Hourly Update'
  })
}

function criticalUpdate() {
  const { avgSensorLight, avgSensorMoisture } = avgSensorDataPastTimeframe(60000)
  const notifiedLowLight = db.get('notifiedLowLight').value()
  const notifiedLowMoisture = db.get('notifiedLowMoisture').value()

  const messages = []

  // moisture sensor has gone below threshold, and the status check has not
  // yet been set in the database. this ensures that a notification will only
  // go out once after the threshold has been breached
  if (avgSensorMoisture < MOISTURE_THRESHOLD && notifiedLowMoisture === 0) {
    messages.push('Warning - Low Moisture Level')
    db.set('notifiedLowMoisture', 1).write()
  // moisture sensor has gone above threshold, and the status check has been set
  // in the database. this ensures that a notification will only go out once
  // after the threshold has been breached
  } else if (avgSensorMoisture >= MOISTURE_THRESHOLD && notifiedLowMoisture === 1) {
    messages.push('Update - Moisture Level Adequate')
    db.set('notifiedLowMoisture', 0).write()
  }

  // light sensor has gone below threshold, and the status check has not
  // yet been set in the database. this ensures that a notification will only
  // go out once after the threshold has been breached
  if (avgSensorLight >= LIGHT_THRESHOLD && notifiedLowLight === 0) {
    messages.push('Warning - Low Light Level')
    db.set('notifiedLowLight', 1).write()
  // light sensor has gone above threshold, and the status check has been set
  // in the database. this ensures that a notification will only go out once
  // after the threshold has been breached
  } else if (avgSensorLight < LIGHT_THRESHOLD && notifiedLowLight === 1) {
    messages.push('Update - Light Level Adequate')
    db.set('notifiedLowLight', 0).write()
  }

  if (messages.length > 0) {
    console.log('Critical update sent')
    sendPushoverMessage({
      message: messages.join('\n'),
      title: 'Auto Plant Hydration - Critical Update'
    })
  } else {
    console.log('No critical update to send')
  }
}

// hourly update of current status of plant
cron.schedule('* * * * *', hourlyUpdate);

// notify user of critical level changes (too low, or back to adequate)
cron.schedule('* * * * *', criticalUpdate);
