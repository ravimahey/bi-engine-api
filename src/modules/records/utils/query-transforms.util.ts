/** `class-transformer` `@Transform` callback: `"a,b,c"` -> `['a', 'b', 'c']`, for comma-separated id-list query params. */
export const toUuidArray = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.split(',').map((v) => v.trim()) : value;

/** `class-transformer` `@Transform` callback: coerces a numeric query param string, leaving `undefined`/`''` alone for `@IsOptional`. */
export const toNumber = ({ value }: { value: unknown }): unknown =>
  value === undefined || value === '' ? value : Number(value);
