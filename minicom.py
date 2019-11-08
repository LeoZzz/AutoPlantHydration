import requests
import RPi.GPIO as GPIO
import serial
import time

# GPIO outpins
pump = 14
leds = 15
piezo = 16

# GPIO config
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)
GPIO.setup(pump, GPIO.OUT)
GPIO.setup(leds, GPIO.OUT)
GPIO.setup(piezo, GPIO.OUT)

# Script config values
config_moisture_threshold = 250
config_light_threshold = 250
config_water_time = 1
config_leds_time = 1
config_pieso_time = 1

# Serial data config
ser = serial.Serial(
    port='/dev/ttyUSB1',
    baudrate = 9600,
    parity=serial.PARITY_NONE,
    stopbits=serial.STOPBITS_ONE,
    bytesize=serial.EIGHTBITS,
    timeout=1
)

# Reads in a chunk of data from the serial port
# Terminates a line when an empty array of data is sent
def read_sensor_data():
    # remains true until empty array is sent
    continue_reading = True
    # Data chunk
    line = ""
    while continue_reading:
        # Read a single line from the serial port
        new_line = ser.readline()
        print new_line
        # check if current line is empty array
        if not new_line.strip():
            # break loop
            continue_reading = False
        else:
            # append current line to chunk of data
            line = line + new_line

    split_data = line.split()
    # some chunks sent do not include valid sensor data
    # default response is to send a negative value
    if len(split_data) < 21:
        return [-1, -1]

    light_sensor = split_data[17]
    moisture_sensor = split_data[20]
    return [light_sensor, moisture_sensor]

# activates pump for a given amount of time when moisture
# sensor reads under a certain threshold
def test_moisture(m):
    if m < config_moisture_threshold:
        GPIO.output(pump, 0)
        time.sleep(config_water_time)
        GPIO.output(pump, 1)
        print "Plant has been watered!"

# activates leds/piezo for a given amount of time when light
# sensor reads under a certain threshold
def test_light_leds(l):
    if l < config_light_threshold:
        GPIO.output(leds, 0)
        time.sleep(config_leds_time)
        GPIO.output(leds, 1)
        print "Leds were on"

    if l > 2 * config_light_threshold:
        GPIO.output(piezo, 0)
        time.sleep(config_pieso_time)
        GPIO.output(piezo, 1)
        print "Piezo was buzzed"

# Posts sensor data to web service
def upload_data(light, moisture):
    r = requests.post(
        "http://localhost:3000/api/sensor-data",
        data = {
            'light': light,
            'moisture': moisture,
        }
    );

    if r.status_code == 200:
        print "Data uploaded to web service"

# Prints a friendly text version of the status of the
# moisture sensor
# used for console print and push notification
def moisture_level(m):
    if m > config_moisture_threshold * 2:
        return "hydrated"
    elif m <= config_moisture_threshold * 2 and m > config_moisture_threshold:
        return "needs water soon"
    elif m < config_moisture_threshold:
        return "needs water now"

# Prints a friendly text version of the status of the
# light sensor
# used for console print and push notification
def light_level(l):
    if l > config_light_threshold * 2:
        return "bright"
    elif l <= config_light_threshold * 2 and l > config_light_threshold:
        return "dim"
    elif l < config_light_threshold:
        return "dark"

# Main script loop
while True:
    [light, moisture] = read_sensor_data()
    print "Moisture status of plant: " + moisture_level(moisture)
    print "Light level on plant: " + light_level(light)
    test_moisture(moisture)
    test_light_leds(light)

    try:
        upload_data(light, moisture)
    except Exception as ex:
        print "There was an error uploading the sensor data"
