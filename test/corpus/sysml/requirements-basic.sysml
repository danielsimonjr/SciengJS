requirement def MassLimit { attribute maxKg = 1500; }
requirement def RangeTarget { attribute km = 500; }
requirement vehicleMass : MassLimit;
requirement vehicleRange : RangeTarget;
part def Vehicle;
satisfy vehicleMass by Vehicle;
satisfy vehicleRange by Vehicle;
