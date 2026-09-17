import { isHostFlagEnabled } from './hostFlag';

it.each([
  [true, true],
  ['true', true],
  ['TRUE', true],
  [false, false],
  ['false', false],
  ['', false],
  [undefined, false],
])('isHostFlagEnabled(%j) is %j', (value, expected) => {
  expect(isHostFlagEnabled(value)).toBe(expected);
});
