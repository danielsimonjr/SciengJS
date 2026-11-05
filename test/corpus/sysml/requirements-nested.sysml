// Nested requirements and satisfy relations to parts.
requirement def Safety { attribute level = "ASIL B"; }
requirement def BrakeSafety :> Safety;
requirement vehicleSafety : Safety {
  requirement braking : BrakeSafety { requirement stopDistance { attribute meters = 40; } }
  requirement lighting;
}
part def Brake;
part def Lamp;
part def Vehicle {
  part brake : Brake;
  part lamps : Lamp [4];
  satisfy vehicleSafety.braking by brake;
}
satisfy vehicleSafety.braking.stopDistance by Vehicle.brake;
satisfy vehicleSafety.lighting by Vehicle.lamps;
