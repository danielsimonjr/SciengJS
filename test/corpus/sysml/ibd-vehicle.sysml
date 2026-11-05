port def FuelPort;
port def DrivePort;
interface def FuelLine;
part def Tank { port out : FuelPort; }
part def Engine { port fuel : FuelPort; port shaft : DrivePort; }
part def Gearbox { port input : DrivePort; port output : DrivePort; }
part def Vehicle {
  part tank : Tank;
  part engine : Engine;
  part gearbox : Gearbox;
  port refuel : FuelPort;
  port wheels : DrivePort;
  connect tank.out to refuel;
  interface line : FuelLine connect tank.out to engine.fuel;
  connect engine.shaft to gearbox.input;
  connect gearbox.output to wheels;
}
