import { Grid, MenuItem, TextField } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { BillingCountryOption, BillingFormValues } from '../billingPrefill';

// Everything the vault/attach body sends unconditionally must be present.
export const REQUIRED_BILLING_FIELDS: (keyof BillingFormValues)[] = [
  'firstName',
  'lastName',
  'address1',
  'city',
  'postalCode',
  'countryCode',
];

interface BillingAddressFieldsProps {
  values: BillingFormValues;
  countries: BillingCountryOption[];
  email: string;
  missingFields: string[];
  onChange: (patch: Partial<BillingFormValues>) => void;
  onEmailChange: (email: string) => void;
}

// Grid ITEMS only, no container: the hosted-form dialog shares one container between its
// card fields and these, so a container here would nest and change the layout.
function BillingAddressFields({
  values,
  countries,
  email,
  missingFields,
  onChange,
  onEmailChange,
}: BillingAddressFieldsProps) {
  const b3Lang = useB3Lang();

  const billingField = (key: keyof BillingFormValues, labelId: string) => (
    <TextField
      fullWidth
      size="small"
      label={b3Lang(labelId)}
      value={values[key]}
      error={missingFields.includes(key)}
      helperText={
        missingFields.includes(key) ? b3Lang('paymentMethods.addCard.requiredField') : undefined
      }
      onChange={(e) => onChange({ [key]: e.target.value })}
    />
  );

  // The attach body wants ISO codes the customer won't know, and a bad code surfaces as
  // the undiagnosable generic failure — so country and state are name-displaying
  // dropdowns submitting codes, falling back to free text when the list is unavailable.
  const selectedCountry = countries.find((c) => c.countryCode === values.countryCode);
  const stateOptions = selectedCountry?.states ?? [];

  const countryField =
    countries.length > 0 ? (
      <TextField
        select
        fullWidth
        size="small"
        label={b3Lang('paymentMethods.addCard.billing.country')}
        value={selectedCountry ? values.countryCode : ''}
        error={missingFields.includes('countryCode')}
        helperText={
          missingFields.includes('countryCode')
            ? b3Lang('paymentMethods.addCard.requiredField')
            : undefined
        }
        onChange={(e) => onChange({ countryCode: e.target.value, stateOrProvinceCode: '' })}
      >
        {countries.map((c) => (
          <MenuItem key={c.countryCode} value={c.countryCode}>
            {c.countryName}
          </MenuItem>
        ))}
      </TextField>
    ) : (
      billingField('countryCode', 'paymentMethods.addCard.billing.country')
    );

  const stateField =
    stateOptions.length > 0 ? (
      <TextField
        select
        fullWidth
        size="small"
        label={b3Lang('paymentMethods.addCard.billing.state')}
        value={
          stateOptions.some((s) => s.stateCode === values.stateOrProvinceCode)
            ? values.stateOrProvinceCode
            : ''
        }
        onChange={(e) => onChange({ stateOrProvinceCode: e.target.value })}
      >
        {stateOptions.map((s) => (
          <MenuItem key={s.stateCode} value={s.stateCode}>
            {s.stateName}
          </MenuItem>
        ))}
      </TextField>
    ) : (
      billingField('stateOrProvinceCode', 'paymentMethods.addCard.billing.state')
    );

  return (
    <>
      <Grid item xs={12}>
        <TextField
          fullWidth
          size="small"
          label={b3Lang('paymentMethods.addCard.billing.email')}
          value={email}
          error={missingFields.includes('email')}
          helperText={
            missingFields.includes('email')
              ? b3Lang('paymentMethods.addCard.requiredField')
              : undefined
          }
          onChange={(e) => onEmailChange(e.target.value)}
        />
      </Grid>
      <Grid item xs={6}>
        {billingField('firstName', 'paymentMethods.addCard.billing.firstName')}
      </Grid>
      <Grid item xs={6}>
        {billingField('lastName', 'paymentMethods.addCard.billing.lastName')}
      </Grid>
      <Grid item xs={12}>
        {billingField('company', 'paymentMethods.addCard.billing.company')}
      </Grid>
      <Grid item xs={12}>
        {billingField('address1', 'paymentMethods.addCard.billing.address1')}
      </Grid>
      <Grid item xs={12}>
        {billingField('address2', 'paymentMethods.addCard.billing.address2')}
      </Grid>
      <Grid item xs={6}>
        {billingField('city', 'paymentMethods.addCard.billing.city')}
      </Grid>
      <Grid item xs={6}>
        {billingField('postalCode', 'paymentMethods.addCard.billing.postalCode')}
      </Grid>
      <Grid item xs={6}>
        {countryField}
      </Grid>
      <Grid item xs={6}>
        {stateField}
      </Grid>
      <Grid item xs={12}>
        {billingField('phone', 'paymentMethods.addCard.billing.phone')}
      </Grid>
    </>
  );
}

export default BillingAddressFields;
