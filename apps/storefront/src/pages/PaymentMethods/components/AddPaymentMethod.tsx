import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button } from '@mui/material';
import { useMutation } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';
import { themeFrameSelector, useAppSelector } from '@/store';
import { snackbar } from '@/utils/b3Tip';

import { PaymentMethodsError, vaultInstrument } from '../api';
import { createDropin, DropinInstance } from '../dropin';

interface AddPaymentMethodProps {
  clientToken: string;
  onAdded: () => void;
}

type AddCardAlert =
  | { kind: 'declined'; reason?: string }
  | { kind: 'rateLimited' }
  | { kind: 'generic' };

function AddPaymentMethod({ clientToken, onAdded }: AddPaymentMethodProps) {
  const b3Lang = useB3Lang();
  const iframeDocument = useAppSelector(themeFrameSelector);
  const [isOpen, setIsOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hasInitError, setHasInitError] = useState(false);
  const [alert, setAlert] = useState<AddCardAlert | null>(null);
  const [isTokenizing, setIsTokenizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<DropinInstance | null>(null);

  const vaultMutation = useMutation({
    mutationFn: vaultInstrument,
    onSuccess: () => {
      // closing unmounts the section; the effect cleanup tears the instance down
      setIsOpen(false);
      onAdded();
    },
    onError: (err) => {
      if (err instanceof PaymentMethodsError && err.kind === 'declined') {
        setAlert({ kind: 'declined', reason: err.declineReason });
        return;
      }
      if (err instanceof PaymentMethodsError && err.kind === 'rateLimited') {
        setAlert({ kind: 'rateLimited' });
        return;
      }
      if (err instanceof PaymentMethodsError && err.kind === 'sessionExpired') {
        snackbar.error(b3Lang('paymentMethods.sessionExpired'));
        return;
      }
      // 502 / network — OUR problem, never worded as a card problem
      setAlert({ kind: 'generic' });
    },
  });

  const isSaving = isTokenizing || vaultMutation.isPending;

  const handleSave = async () => {
    const instance = instanceRef.current;
    if (!instance || isSaving) {
      return;
    }
    setAlert(null);
    setIsTokenizing(true);
    try {
      // Card details never touch our code: they go from Braintree's iframes to
      // Braintree; we only ever see the nonce. Never log it.
      const { nonce, deviceData } = await instance.requestPaymentMethod();
      vaultMutation.mutate({ nonce, deviceData });
    } catch {
      // invalid/incomplete fields — Drop-in renders its own inline field errors
    } finally {
      setIsTokenizing(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !iframeDocument || !containerRef.current) {
      return undefined;
    }

    let cancelled = false;
    createDropin(iframeDocument, containerRef.current, clientToken)
      .then((instance) => {
        if (cancelled) {
          instance.teardown();
          return;
        }
        instanceRef.current = instance;
        setIsReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setHasInitError(true);
        }
      });

    return () => {
      cancelled = true;
      instanceRef.current?.teardown();
      instanceRef.current = null;
      setIsReady(false);
    };
  }, [isOpen, iframeDocument, clientToken]);

  if (!isOpen) {
    return (
      <Box sx={{ mb: 2 }}>
        <Button
          variant="outlined"
          onClick={() => {
            setHasInitError(false);
            setAlert(null);
            setIsOpen(true);
          }}
        >
          {b3Lang('paymentMethods.addCard.button')}
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 2 }}>
      {hasInitError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {b3Lang('paymentMethods.addCard.error')}
        </Alert>
      )}
      {alert && (
        <Alert severity={alert.kind === 'declined' ? 'warning' : 'error'} sx={{ mb: 2 }}>
          {alert.kind === 'declined' &&
            (alert.reason
              ? b3Lang('paymentMethods.addCard.declinedWithReason', { reason: alert.reason })
              : b3Lang('paymentMethods.addCard.declined'))}
          {alert.kind === 'rateLimited' && b3Lang('paymentMethods.addCard.rateLimited')}
          {alert.kind === 'generic' && b3Lang('paymentMethods.addCard.error')}
        </Alert>
      )}
      <div ref={containerRef} />
      <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
        <Button variant="contained" disabled={!isReady || isSaving} onClick={handleSave}>
          {b3Lang('paymentMethods.addCard.save')}
        </Button>
        <Button disabled={isSaving} onClick={() => setIsOpen(false)}>
          {b3Lang('paymentMethods.addCard.cancel')}
        </Button>
      </Box>
    </Box>
  );
}

export default AddPaymentMethod;
