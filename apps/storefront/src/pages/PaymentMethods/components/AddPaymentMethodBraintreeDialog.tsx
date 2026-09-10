import { useEffect, useRef, useState } from 'react';
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
  Typography,
} from '@mui/material';

import { useB3Lang } from '@/lib/lang';
import { useAppSelector } from '@/store';
import { themeFrameSelector } from '@/store/selectors';

import { PaymentMethodsError, vaultBraintreeInstrument } from '../api';
import {
  BillingCountryOption,
  BillingFormValues,
  emptyBillingValues,
  getBillingCountries,
  getBillingPrefill,
} from '../billingPrefill';
import { createDropinWithTimeout, DropinInstance } from '../dropin';

import BillingAddressFields, { REQUIRED_BILLING_FIELDS } from './BillingAddressFields';

interface AddPaymentMethodBraintreeDialogProps {
  onClose: () => void;
  onAdded: () => void;
  customerEmail: string;
  clientToken: string;
}

// A card problem and a system problem read differently, but no variant of a decline ever
// explains itself: a verification endpoint that does is a card-testing oracle (spec §9).
// Anything unmapped is a system problem.
const SUBMIT_ERROR_MESSAGE_IDS: Record<string, string> = {
  declined: 'paymentMethods.addCard.failed',
  rateLimited: 'paymentMethods.errors.rateLimited',
  sessionExpired: 'paymentMethods.sessionExpired',
};

const submitErrorMessageId = (error: unknown) => {
  if (error instanceof PaymentMethodsError) {
    return SUBMIT_ERROR_MESSAGE_IDS[error.kind] ?? 'paymentMethods.errors.generic';
  }

  // Drop-in refused to tokenize: blank or invalid card fields, which is a card problem.
  return 'paymentMethods.addCard.failed';
};

function AddPaymentMethodBraintreeDialog({
  onClose,
  onAdded,
  customerEmail,
  clientToken,
}: AddPaymentMethodBraintreeDialogProps) {
  const b3Lang = useB3Lang();
  const themeFrame = useAppSelector(themeFrameSelector);
  // MUI's Dialog renders through a Portal, which mounts children in an effect, so a plain
  // ref is still null during this component's mount effect. Holding the node in state and
  // keying the init effect on it starts Drop-in exactly when the node really exists.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const dropinRef = useRef<DropinInstance | null>(null);
  const hasStartedInitRef = useRef(false);
  const [isFormReady, setIsFormReady] = useState(false);
  const [hasInitError, setHasInitError] = useState(false);
  const [billing, setBilling] = useState<BillingFormValues>(emptyBillingValues);
  const [countries, setCountries] = useState<BillingCountryOption[]>([]);
  const [email, setEmail] = useState(customerEmail);
  const [isSaving, setIsSaving] = useState(false);
  const [submitErrorId, setSubmitErrorId] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);

  useEffect(() => {
    if (!container || hasStartedInitRef.current) {
      return undefined;
    }
    hasStartedInitRef.current = true;

    let cancelled = false;

    const init = async () => {
      // Braintree deadlocks unless its hosted fields live in the ThemeFrame realm, so
      // both the document and the container must come from inside the frame. This is the
      // exact inverse of checkout-sdk's hosted form, which only works from the top realm.
      if (!themeFrame) {
        throw new Error('The ThemeFrame document is not available');
      }

      const [dropin, countryList] = await Promise.all([
        createDropinWithTimeout(themeFrame, container, clientToken),
        getBillingCountries(),
      ]);
      const prefill = await getBillingPrefill(countryList);

      if (cancelled) {
        dropin.teardown().catch(() => undefined);

        return;
      }

      dropinRef.current = dropin;
      setCountries(countryList);
      setBilling(prefill);
      setIsFormReady(true);
    };

    init().catch(() => {
      if (!cancelled) {
        setHasInitError(true);
      }
    });

    return () => {
      cancelled = true;
      dropinRef.current?.teardown().catch(() => undefined);
      dropinRef.current = null;
    };
    // Runs once, when the portal has attached the container node; hasStartedInitRef
    // makes any later run a no-op, so the extra deps cannot re-mount Drop-in.
  }, [container, themeFrame, clientToken]);

  const handleSave = async () => {
    const dropin = dropinRef.current;
    if (!dropin || isSaving) {
      return;
    }

    const missing: string[] = REQUIRED_BILLING_FIELDS.filter((key) => !billing[key].trim());
    if (!email.trim()) {
      missing.push('email');
    }
    setMissingFields(missing);
    if (missing.length > 0) {
      return;
    }

    setSubmitErrorId(null);
    setIsSaving(true);
    try {
      // A fresh nonce per attempt, so a retry after any failure is always clean and an
      // expired or already-consumed nonce can never be resubmitted.
      const { nonce, deviceData } = await dropin.requestPaymentMethod();
      await vaultBraintreeInstrument({
        nonce,
        deviceData,
        billing,
        email: email.trim(),
        makeDefault: false,
      });
      onAdded();
    } catch (error) {
      setSubmitErrorId(submitErrorMessageId(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={isSaving ? undefined : onClose}>
      <DialogTitle>{b3Lang('paymentMethods.addCard.dialogTitle')}</DialogTitle>
      <DialogContent>
        {hasInitError ? (
          <Alert severity="error">{b3Lang('paymentMethods.addCard.braintree.formError')}</Alert>
        ) : (
          <>
            {!isFormReady && (
              <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                <CircularProgress size={24} />
              </Box>
            )}
            {submitErrorId && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {b3Lang(submitErrorId)}
              </Alert>
            )}
            {/* Always mounted: Drop-in needs a live container element at init time. */}
            <Box ref={setContainer} sx={{ display: isFormReady ? 'block' : 'none' }} />
            {isFormReady && (
              <Grid container spacing={2} sx={{ mt: 0 }}>
                <Grid item xs={12}>
                  <Typography variant="subtitle2">
                    {b3Lang('paymentMethods.addCard.billingTitle')}
                  </Typography>
                </Grid>
                <BillingAddressFields
                  values={billing}
                  countries={countries}
                  email={email}
                  missingFields={missingFields}
                  onChange={(patch) => setBilling((prev) => ({ ...prev, ...patch }))}
                  onEmailChange={setEmail}
                />
              </Grid>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button disabled={isSaving} onClick={onClose}>
          {b3Lang('paymentMethods.addCard.cancel')}
        </Button>
        {isFormReady && !hasInitError && (
          <Button variant="contained" disabled={isSaving} onClick={handleSave}>
            {b3Lang('paymentMethods.addCard.save')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default AddPaymentMethodBraintreeDialog;
