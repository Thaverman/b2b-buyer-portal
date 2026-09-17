/**
 * Theme templates emit booleans as strings routinely, so a host flag is on for `true` and for
 * "true" in any case. A plain truthiness check is wrong: the string "false" is truthy too and
 * would switch a store on that the theme had explicitly switched off.
 */
export const isHostFlagEnabled = (value: boolean | string | undefined) =>
  value === true || (typeof value === 'string' && value.toLowerCase() === 'true');
