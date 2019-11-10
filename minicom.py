import requests
import RPi.GPIO as GPIO
import serial
import time

# GPIO outpins
pump = 16
leds = 20
piezo = 21

# GPIO config
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)
GPIO.setup(pump, GPIO.OUT)
GPIO.setup(leds, GPIO.OUT)
GPIO.setup(piezo, GPIO.OUT)

# Script config values
config_moisture_threshold = 250
config_light_threshold = 750
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
    line = {
        "moisture": -1,
        "light": -1
    }

    while continue_reading:
        # Read a single line from the serial port
        new_line = ser.readline()
        # check if current line is empty array
        if not new_line.strip():
            # break loop
            continue_reading = False
        else:
            new_line_split = new_line.split()
            if len(new_line_split) >= 2:
                ## check if line includes serial data for moisture sensor
                if new_line_split[1] == 'VAUX06':
                    line["moisture"] = int(new_line_split[2])
                ## check if line includes serial data for light sensor
                if new_line_split[1] == 'VAUX15':
                    line["light"] = int(new_line_split[2])

    return [line["light"], line["moisture"]]

# activates pump for a given amount of time when moisture
# sensor reads under a certain threshold
def test_moisture(m):
    if int(m) < config_moisture_threshold:
        GPIO.output(pump, 0)
        time.sleep(config_water_time)
        GPIO.output(pump, 1)
        print "Watering plant"
    else:
        GPIO.output(pump, 1)
        print "Moisture level adequate"

# activates leds/piezo for a given amount of time when light
# sensor reads under a certain threshold
def test_light_leds(l):
    sensor_above_threshold = int(l) > config_light_threshold
    if sensor_above_threshold:
        GPIO.output(leds, 0)
        time.sleep(config_leds_time)
        GPIO.output(leds, 1)
        print "Leds flashed"
    else:
        print "Lights off"

    if sensor_above_threshold:
        GPIO.output(piezo, 0)
        time.sleep(config_pieso_time)
        GPIO.output(piezo, 1)
        print "Piezo was buzzed"
    else:
        print "Buzzer off"

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
        print("Data uploaded to web service")

# Prints a friendly text version of the status of the
# moisture sensor
# used for console print and push notification
def moisture_level(m):
    if m >= config_moisture_threshold:
        return "hydrated"
    elif m < config_moisture_threshold:
        return "needs water now"

# Prints a friendly text version of the status of the
# light sensor
# used for console print and push notification
def light_level(l):
    if l >= config_light_threshold:
        return "dark"
    elif l < config_light_threshold:
        return "bright"

def bytes2int(byes):
    result=0
    for b in byes:
        result = result * 256 + int(b)
    return result

# Main script loop
while True:
    [light, moisture] = read_sensor_data()
    test_moisture(moisture)
    test_light_leds(light)

    try:
        upload_data(light, moisture)
    except Exception as ex:
        print("There was an error uploading the sensor data")

    print '\n'
