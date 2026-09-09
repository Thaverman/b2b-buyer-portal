import { faker } from '@faker-js/faker';
import { builder } from 'tests/builder';

import { RegisterFields } from '../../types';

import { prefillAddressFromContact } from './prefillAddressFromContact';

const buildRegisterFieldWith = builder<RegisterFields>(() => ({
  name: faker.string.uuid(),
  fieldId: faker.string.uuid(),
  label: faker.lorem.word(),
  fieldType: 'text',
  default: '',
}));

describe('prefillAddressFromContact', () => {
  it.each([
    ['field_first_name', 'firstName'],
    ['field_last_name', 'lastName'],
    ['field_company_name', 'company'],
    ['field_phone_number', 'phone'],
  ])('copies the contact %s onto the blank address %s field', (contactFieldId, addressName) => {
    const value = faker.lorem.word();
    const contactFields = [buildRegisterFieldWith({ fieldId: contactFieldId, default: value })];
    const addressFields = [buildRegisterFieldWith({ name: addressName, default: '' })];

    const [prefilled] = prefillAddressFromContact(contactFields, addressFields);

    expect(prefilled.default).toBe(value);
  });

  it('leaves an address field that the buyer already filled in untouched', () => {
    const contactFields = [
      buildRegisterFieldWith({ fieldId: 'field_first_name', default: 'John' }),
    ];
    const addressFields = [buildRegisterFieldWith({ name: 'firstName', default: 'Tom' })];

    const [prefilled] = prefillAddressFromContact(contactFields, addressFields);

    expect(prefilled.default).toBe('Tom');
  });

  it('leaves address fields with no contact counterpart untouched', () => {
    const contactFields = [
      buildRegisterFieldWith({ fieldId: 'field_first_name', default: 'John' }),
    ];
    const addressFields = [buildRegisterFieldWith({ name: 'address1', default: '' })];

    const [prefilled] = prefillAddressFromContact(contactFields, addressFields);

    expect(prefilled.default).toBe('');
  });

  it('does not mutate the address fields it was given', () => {
    const contactFields = [
      buildRegisterFieldWith({ fieldId: 'field_first_name', default: 'John' }),
    ];
    const addressField = buildRegisterFieldWith({ name: 'firstName', default: '' });

    prefillAddressFromContact(contactFields, [addressField]);

    expect(addressField.default).toBe('');
  });
});
