// The blocks of a vehicle and their composition.
package Vehicles {
  part def Vehicle {
    attribute mass : Real = 1200;
    part engine : Engine;
    part wheels : Wheel [4];
    part seats : Seat [2..5];
  }
  part def Engine { attribute power : Real = 150; }
  part def Wheel { attribute diameter : Real = 0.6; }
  part def Seat;
}
