// ISO 4217 List One (SIX Maintenance Agency), published 2026-09-17.
// https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml
// Includes all codes with a numeric minor unit. Codes marked N.A. are omitted.
const MINOR_UNITS = new Map<string, number>();

for (const [digits, codes] of [
  [0, ["BIF CLP DJF GNF ISK JPY KMF KRW PYG RWF UGX UYI VND VUV XAF XOF XPF"]],
  [
    2,
    [
      "AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BMD BND BOB BOV BRL BSD BTN",
      "BWP BYN BZD CAD CDF CHE CHF CHW CNY COP COU CRC CUP CVE CZK DKK DOP DZD EGP",
      "ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GTQ GYD HKD HNL HTG HUF IDR ILS INR",
      "IRR JMD KES KGS KHR KPW KYD KZT LAK LBP LKR LRD LSL MAD MDL MGA MKD MMK MNT",
      "MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD NGN NIO NOK NPR NZD PAB PEN PGK PHP",
      "PKR PLN QAR RON RSD RUB SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC",
      "SYP SZL THB TJS TMT TOP TRY TTD TWD TZS UAH USD USN UYU UZS VED VES WST XAD",
      "XCD XCG YER ZAR ZMW ZWG",
    ],
  ],
  [3, ["BHD IQD JOD KWD LYD OMR TND"]],
  [4, ["CLF UYW"]],
] as const) {
  for (const code of codes.join(" ").split(" ")) MINOR_UNITS.set(code, digits);
}

export function isoMinorUnits(currency: string): number | undefined {
  return MINOR_UNITS.get(currency.toUpperCase());
}
