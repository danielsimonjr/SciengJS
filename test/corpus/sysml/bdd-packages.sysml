// Nested packages and a reference before its definition.
package Plant {
  package Control {
    part def Controller { part sensor : Sensor; part valve : Valve; }
  }
  package Field {
    part def Sensor { attribute range = "0 to 10 bar"; }
    part def Valve { attribute kind = ball; }
  }
}
