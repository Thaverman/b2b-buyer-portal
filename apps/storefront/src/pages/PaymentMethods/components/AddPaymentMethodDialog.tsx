import { useEffect, useRef, useState } from 'react';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  GlobalStyles,
  Grid,
  Link,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';

import { Z_INDEX } from '@/constants';
import { useB3Lang } from '@/lib/lang';

import {
  BillingCountryOption,
  BillingFormValues,
  emptyBillingValues,
  getBillingCountries,
  getBillingPrefill,
} from '../billingPrefill';
import { createStoredCardForm, StoredCardForm } from '../hostedForm';
import {
  getVaultAccess,
  hasCheckoutContext,
  NATIVE_ADD_PAYMENT_METHOD_PATH,
  VaultAccess,
} from '../vaultAccess';

interface AddPaymentMethodDialogProps {
  onClose: () => void;
  onAdded: () => void;
  customerEmail: string;
}

// This dialog deliberately renders in the PARENT document, not the ThemeFrame: the
// stored-card hosted form only initializes from the top realm with containers in the top
// document (spec §2.1). MUI's Dialog portals to the component realm's document.body — the
// parent document — by default (B3Dialog passes an in-iframe container to opt OUT of
// that; here the default is exactly what we need). Styles must follow the DOM: the app's
// CacheProvider targets the iframe head, so this subtree carries its own cache bound to
// the parent head.
const parentDocumentCache = createCache({
  key: 'bpm-add-card',
  container: document.head,
  prepend: true,
});

const CARD_FIELD_CONTAINERS = {
  number: 'bpm-card-number',
  expiry: 'bpm-card-expiry',
  name: 'bpm-card-name',
  cvv: 'bpm-card-cvv',
};

const cardFieldSx = {
  height: '44px',
  border: '1px solid',
  borderColor: 'grey.400',
  borderRadius: 1,
  px: 1,
};

const DIALOG_CLASS = 'bpm-add-card-dialog';

// Outside the ThemeFrame the storefront theme's global element rules apply to us. MUI's
// own declarations win on specificity, but properties MUI never declares leak through —
// the theme's `legend { border-width: 0 0 1px; width: 100%; margin-bottom }` draws a line
// through the floating label's outline notch, and its `label { padding-left; width }`
// shoves the label around. Zero out exactly those leaks, scoped to this dialog.
const themeBleedReset = (
  <GlobalStyles
    styles={{
      [`.${DIALOG_CLASS} legend`]: {
        border: 0,
        margin: 0,
        background: 'none',
        width: 'auto',
      },
      [`.${DIALOG_CLASS} label`]: {
        paddingLeft: 0,
        width: 'auto',
        margin: 0,
      },
    }}
  />
);

// checkout-sdk's initialize() has no timeout of its own: if the hosted-field iframe never
// completes its handshake (blocked, challenged, offline) it waits forever — seen live as an
// endless spinner with nothing in the console. Bound the wait so the customer gets the
// error alert and the native-page link instead.
const HOSTED_FORM_INIT_TIMEOUT_MS = 20_000;

const createStoredCardFormWithTimeout = (): Promise<StoredCardForm> =>
  new Promise((resolve, reject) => {
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      reject(new Error('Hosted card form did not initialize in time'));
    }, HOSTED_FORM_INIT_TIMEOUT_MS);

    createStoredCardForm(CARD_FIELD_CONTAINERS).then(
      (form) => {
        if (timedOut) {
          // too late — the dialog has already fallen back; don't leave live fields behind
          form.teardown();
          return;
        }
        window.clearTimeout(timer);
        resolve(form);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });

// Everything the attach body sends unconditionally must be present (spec §5.4).
const REQUIRED_FIELDS: (keyof BillingFormValues)[] = [
  'firstName',
  'lastName',
  'address1',
  'city',
  'postalCode',
  'countryCode',
];

function AddPaymentMethodDialog({ onClose, onAdded, customerEmail }: AddPaymentMethodDialogProps) {
  const b3Lang = useB3Lang();
  const [access, setAccess] = useState<Extract<VaultAccess, { state: 'available' }> | null>(null);
  const [isFormReady, setIsFormReady] = useState(false);
  const [hasInitError, setHasInitError] = useState(false);
  const [hasNoCheckoutContext, setHasNoCheckoutContext] = useState(false);
  const [billing, setBilling] = useState<BillingFormValues>(emptyBillingValues);
  const [countries, setCountries] = useState<BillingCountryOption[]>([]);
  const [email, setEmail] = useState(customerEmail);
  const [isSaving, setIsSaving] = useState(false);
  const [hasSubmitError, setHasSubmitError] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const formRef = useRef<StoredCardForm | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      // The page gate checked for a cart at load; the cart may have emptied since. Probe
      // before creating the hosted form so a missing checkout context fails fast into the
      // honest copy instead of spending the init timeout on a blank field iframe.
      if (!(await hasCheckoutContext())) {
        if (!cancelled) {
          setHasNoCheckoutContext(true);
        }
        return;
      }

      // Mint-fresh access on every open: the vault token lives ~30 minutes, so the page-load
      // gating result may be stale by the time the customer gets here.
      const [vaultAccess, form, billingInit] = await Promise.all([
        getVaultAccess(),
        createStoredCardFormWithTimeout(),
        // the prefill's state-name→code mapping needs the country list, so chain them
        getBillingCountries().then(async (countryList) => ({
          countryList,
          prefill: await getBillingPrefill(countryList),
        })),
      ]);
      if (cancelled) {
        form.teardown();
        return;
      }
      if (vaultAccess.state !== 'available') {
        form.teardown();
        setHasInitError(true);
        return;
      }
      formRef.current = form;
      setAccess(vaultAccess);
      setCountries(billingInit.countryList);
      setBilling(billingInit.prefill);
      setIsFormReady(true);
    };

    init().catch(() => {
      if (!cancelled) {
        setHasInitError(true);
      }
    });

    return () => {
      cancelled = true;
      formRef.current?.teardown();
      formRef.current = null;
    };
    // mount-only by design: the dialog is unmounted on close
  }, []);

  const handleSave = async () => {
    const form = formRef.current;
    if (!form || !access || isSaving) {
      return;
    }

    const missing: string[] = REQUIRED_FIELDS.filter((key) => !billing[key].trim());
    if (!email.trim()) {
      missing.push('email');
    }
    setMissingFields(missing);
    if (missing.length > 0) {
      return;
    }

    setHasSubmitError(false);
    setIsSaving(true);
    try {
      await form.submit(
        {
          defaultInstrument: false,
          email: email.trim(),
          firstName: billing.firstName.trim(),
          lastName: billing.lastName.trim(),
          address1: billing.address1.trim(),
          city: billing.city.trim(),
          postalCode: billing.postalCode.trim(),
          countryCode: billing.countryCode.trim(),
          ...(billing.address2.trim() && { address2: billing.address2.trim() }),
          ...(billing.company.trim() && { company: billing.company.trim() }),
          ...(billing.phone.trim() && { phone: billing.phone.trim() }),
          ...(billing.stateOrProvinceCode.trim() && {
            stateOrProvinceCode: billing.stateOrProvinceCode.trim(),
          }),
        },
        {
          shopperId: access.shopperId,
          storeHash: access.storeHash,
          vaultToken: access.vaultToken,
        },
      );
      // Resolves with no body (spec §2.5) — the parent refetches the list.
      onAdded();
    } catch {
      // The SDK reports failure with no detail — decline and system error are
      // indistinguishable (spec §2.6). One honest message; never blame the card.
      setHasSubmitError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const billingField = (key: keyof BillingFormValues, labelId: string) => (
    <TextField
      fullWidth
      size="small"
      label={b3Lang(labelId)}
      value={billing[key]}
      error={missingFields.includes(key)}
      helperText={
        missingFields.includes(key) ? b3Lang('paymentMethods.addCard.requiredField') : undefined
      }
      onChange={(e) => setBilling((prev) => ({ ...prev, [key]: e.target.value }))}
    />
  );

  // The attach body wants ISO codes the customer won't know, and a bad code surfaces as
  // the undiagnosable generic failure — so country and state are name-displaying
  // dropdowns submitting codes, falling back to free text when the list is unavailable.
  const selectedCountry = countries.find((c) => c.countryCode === billing.countryCode);
  const stateOptions = selectedCountry?.states ?? [];

  const countryField =
    countries.length > 0 ? (
      <TextField
        select
        fullWidth
        size="small"
        label={b3Lang('paymentMethods.addCard.billing.country')}
        value={selectedCountry ? billing.countryCode : ''}
        error={missingFields.includes('countryCode')}
        helperText={
          missingFields.includes('countryCode')
            ? b3Lang('paymentMethods.addCard.requiredField')
            : undefined
        }
        onChange={(e) =>
          setBilling((prev) => ({ ...prev, countryCode: e.target.value, stateOrProvinceCode: '' }))
        }
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
          stateOptions.some((s) => s.stateCode === billing.stateOrProvinceCode)
            ? billing.stateOrProvinceCode
            : ''
        }
        onChange={(e) => setBilling((prev) => ({ ...prev, stateOrProvinceCode: e.target.value }))}
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

  // Both replace the form entirely: no spinner, no fields, Save stays disabled.
  const renderInitProblem = () =>
    hasNoCheckoutContext ? (
      <Alert severity="info">{b3Lang('paymentMethods.addCard.needsCart')}</Alert>
    ) : (
      <Alert severity="error">
        {b3Lang('paymentMethods.addCard.formError')}{' '}
        <Link href={NATIVE_ADD_PAYMENT_METHOD_PATH} target="_top">
          {b3Lang('paymentMethods.addCard.button')}
        </Link>
      </Alert>
    );

  return (
    <CacheProvider value={parentDocumentCache}>
      {themeBleedReset}
      {/* The ThemeFrame overlay sits at Z_INDEX.IFRAME (12000); MUI's default modal
          z-index (1300) would put this dialog underneath it. */}
      <Dialog
        open
        fullWidth
        maxWidth="sm"
        className={DIALOG_CLASS}
        onClose={onClose}
        sx={{ zIndex: Z_INDEX.MODAL }}
      >
        <DialogTitle>{b3Lang('paymentMethods.addCard.dialogTitle')}</DialogTitle>
        <DialogContent>
          {hasNoCheckoutContext || hasInitError ? (
            renderInitProblem()
          ) : (
            <>
              {!isFormReady && (
                <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              )}
              {hasSubmitError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {b3Lang('paymentMethods.addCard.failed')}
                </Alert>
              )}
              <Grid container spacing={2} sx={{ mt: 0 }}>
                <Grid item xs={12}>
                  <Typography variant="body2">
                    {b3Lang('paymentMethods.addCard.cardNumber')}
                  </Typography>
                  <Box id={CARD_FIELD_CONTAINERS.number} sx={cardFieldSx} />
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">{b3Lang('paymentMethods.addCard.expiry')}</Typography>
                  <Box id={CARD_FIELD_CONTAINERS.expiry} sx={cardFieldSx} />
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">{b3Lang('paymentMethods.addCard.cvv')}</Typography>
                  <Box id={CARD_FIELD_CONTAINERS.cvv} sx={cardFieldSx} />
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="body2">
                    {b3Lang('paymentMethods.addCard.nameOnCard')}
                  </Typography>
                  <Box id={CARD_FIELD_CONTAINERS.name} sx={cardFieldSx} />
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2">
                    {b3Lang('paymentMethods.addCard.billingTitle')}
                  </Typography>
                </Grid>
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
                    onChange={(e) => setEmail(e.target.value)}
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
              </Grid>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={isSaving} onClick={onClose}>
            {b3Lang('paymentMethods.addCard.cancel')}
          </Button>
          <Button
            variant="contained"
            disabled={!isFormReady || !access || isSaving}
            onClick={handleSave}
          >
            {b3Lang('paymentMethods.addCard.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </CacheProvider>
  );
}

export default AddPaymentMethodDialog;
