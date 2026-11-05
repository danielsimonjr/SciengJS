/* A family of vehicles.
   Each kind specializes Vehicle. */
part def Vehicle { attribute mass : Real; }
part def Car :> Vehicle { attribute doors = 4; }
part def Truck :> Vehicle { attribute payload : Real = 8000; }
part def Pickup :> Truck;
