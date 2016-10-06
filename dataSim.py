#! /usr/bin/env python
import paho.mqtt.client as mqtt
import json


MQTT_TOPIC          = "devnet/#"
MQTT_ADDR           = "128.107.70.30"
MQTT_PORT           = 1883
MQTT_TOPIC_FILTERED = 'devnet/train/sim'


class MyMQTTClass:
    def __init__(self, clientid=None):
        # Message queue for incoming unfiltered data
        self._mqttc = mqtt.Client(clientid)
        self._mqttc.on_connect = self.mqtt_on_connect
        self._sendMqtt = mqtt.Client(clientid)

        json_data = open("data").read()
        self.simData = json.loads(json_data)

        #print(self.simData)

    def run(self):
        self._mqttc.connect(MQTT_ADDR, MQTT_PORT, 60)
        self._mqttc.subscribe(MQTT_TOPIC, 0)

        for i in self.simData:
            #print (MQTT_TOPIC_FILTERED + "/" + i['block'] + "--->" + json.dumps(i))
            self._mqttc.publish(MQTT_TOPIC_FILTERED + "/" + i['block'], json.dumps(i))
            #time.sleep(.1)

    def mqtt_on_connect(self, mqttc, obj, flags, rc):
        print("rc: "+str(rc))


if __name__ == "__main__":
    mqttc = MyMQTTClass()

    rc = mqttc.run()

