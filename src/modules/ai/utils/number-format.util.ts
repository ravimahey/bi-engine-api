/** Rounds money to cents so summed floats don't leak artifacts like 6450.000000001. */
export const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Rounds a percentage to one decimal place. */
export const round1 = (value: number): number => Math.round(value * 10) / 10;
