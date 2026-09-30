export type Prices = {
  individualDay: number;
  individualNight: number;
  groupSingle: number;
  rentalDay: number;
  rentalNight: number;
  caddieSurcharge: number;
};

export type RentalForPricing = {
  status: string;
  turns: number;
  nightTurns: number;
  caddieId: string | null;
};

/**
 * Valor de un alquiler (CA-27): turnos por precio según franja, más el recargo por caddie
 * por cada turno si se usó con caddie. No usado o cancelado no se cobra (RN-10).
 */
export function rentalValue(r: RentalForPricing, p: Prices): number {
  if (r.status === "no_usado" || r.status === "cancelada_cliente") return 0;
  const dayTurns = r.turns - r.nightTurns;
  let value = dayTurns * p.rentalDay + r.nightTurns * p.rentalNight;
  if (r.status === "usado" && r.caddieId) value += r.turns * p.caddieSurcharge;
  return value;
}

export type LooseType = "individual_diurna" | "individual_nocturna" | "grupal";

export function loosePrice(type: LooseType, p: Prices): number {
  if (type === "individual_diurna") return p.individualDay;
  if (type === "individual_nocturna") return p.individualNight;
  return p.groupSingle;
}
