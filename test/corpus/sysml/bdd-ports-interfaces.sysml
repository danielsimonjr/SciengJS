port def FuelPort { attribute rate : Real; }
port def PowerPort { attribute voltage : Real = 12; }
interface def FuelLine { attribute length : Real; }
part def Tank { port out : FuelPort; }
part def Engine { port fuel : FuelPort; port power : PowerPort; }
part def Drivetrain {
  part tank : Tank;
  part engine : Engine;
  interface line : FuelLine connect tank.out to engine.fuel;
}
