/** `class-transformer` `@Transform` callback: `"a,b"` -> `['a', 'b']`, for comma-separated multi-value filters. */
export const toStringArray = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    : value;
