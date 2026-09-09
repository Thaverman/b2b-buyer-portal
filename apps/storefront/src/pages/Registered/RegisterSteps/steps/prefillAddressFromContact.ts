import { RegisterFields } from '../../types';

// Step-1 contact field (by fieldId) -> step-2 address field (by name).
const CONTACT_TO_ADDRESS: Record<string, string> = {
  field_first_name: 'firstName',
  field_last_name: 'lastName',
  field_company_name: 'company',
  field_phone_number: 'phone',
};

const isBlank = (value: RegisterFields['default']) =>
  value === '' || value === null || value === undefined;

/**
 * Seeds the step-2 address fields with the values the buyer already typed on step 1,
 * without overwriting anything they have filled in on step 2 themselves.
 */
export function prefillAddressFromContact(
  contactFields: RegisterFields[],
  addressFields: RegisterFields[],
): RegisterFields[] {
  return addressFields.map((field) => {
    if (!isBlank(field.default)) return field;

    const source = contactFields.find(
      (contact) => CONTACT_TO_ADDRESS[contact.fieldId] === field.name,
    );

    return source && !isBlank(source.default) ? { ...field, default: source.default } : field;
  });
}
