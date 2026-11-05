// A specialized block inherits the parts, ports and connections of its base.
port def SignalPort;
part def Sensor { port signal : SignalPort; }
part def Logger { port input : SignalPort; }
part def Station {
  part sensor : Sensor;
  part logger : Logger;
  connect sensor.signal to logger.input;
}
part def RemoteStation :> Station {
  port uplink : SignalPort;
  connect logger.input to uplink;
}
