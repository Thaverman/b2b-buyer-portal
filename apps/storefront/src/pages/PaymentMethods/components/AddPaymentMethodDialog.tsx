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
  Grid,
  Link,
  TextField,
  Typography,
} from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { BillingFormValues, emptyBillingValues, getBillingPrefill } from '../billingPrefill';
import { createStoredCardForm, StoredCardForm } from '../hostedForm';
import { getVaultAccess, NATIVE_ADD_PAYMENT_METHOD_PATH, VaultAccess } from '../vaultAccess';

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

export const CARD_FIELD_CONTAINERS = {
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

// onAdded is wired by the save flow (next task); until then only the shell renders.
function AddPaymentMethodDialog({ onClose, customerEmail }: AddPaymentMethodDialogProps) {
  const b3Lang = useB3Lang();
  const [access, setAccess] = useState<Extract<VaultAccess, { state: 'available' }> | null>(null);
  const [isFormReady, setIsFormReady] = useState(false);
  const [hasInitError, setHasInitError] = useState(false);
  const [billing, setBilling] = useState<BillingFormValues>(emptyBillingValues);
  const [email, setEmail] = useState(customerEmail);
  const formRef = useRef<StoredCardForm | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Mint-fresh access on every open: the vault token lives ~30 minutes, so the page-load
    // gating result may be stale by the time the customer gets here.
    Promise.all([getVaultAccess(), createStoredCardForm(CARD_FIELD_CONTAINERS), getBillingPrefill()])
      .then(([vaultAccess, form, prefill]) => {
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
        setBilling(prefill);
        setIsFormReady(true);
      })
      .catch(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const billingField = (key: keyof BillingFormValues, labelId: string) => (
    <TextField
      fullWidth
      size="small"
      label={b3Lang(labelId)}
      value={billing[key]}
      onChange={(e) => setBilling((prev) => ({ ...prev, [key]: e.target.value }))}
    />
  );

  return (
    <CacheProvider value={parentDocumentCache}>
      <Dialog open fullWidth maxWidth="sm" onClose={onClose}>
        <DialogTitle>{b3Lang('paymentMethods.addCard.dialogTitle')}</DialogTitle>
        <DialogContent>
          {hasInitError ? (
            <Alert severity="error">
              {b3Lang('paymentMethods.addCard.formError')}{' '}
              <Link href={NATIVE_ADD_PAYMENT_METHOD_PATH} target="_top">
                {b3Lang('paymentMethods.addCard.button')}
              </Link>
            </Alert>
          ) : (
            <>
              {!isFormReady && (
                <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                  <CircularProgress size={24} />
                </Box>
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
                  {billingField('stateOrProvinceCode', 'paymentMethods.addCard.billing.state')}
                </Grid>
                <Grid item xs={6}>
                  {billingField('postalCode', 'paymentMethods.addCard.billing.postalCode')}
                </Grid>
                <Grid item xs={6}>
                  {billingField('countryCode', 'paymentMethods.addCard.billing.country')}
                </Grid>
                <Grid item xs={12}>
                  {billingField('phone', 'paymentMethods.addCard.billing.phone')}
                </Grid>
              </Grid>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{b3Lang('paymentMethods.addCard.cancel')}</Button>
          <Button variant="contained" disabled={!isFormReady || !access}>
            {b3Lang('paymentMethods.addCard.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </CacheProvider>
  );
}

export default AddPaymentMethodDialog;
