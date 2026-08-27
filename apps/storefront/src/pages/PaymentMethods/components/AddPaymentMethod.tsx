import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button } from '@mui/material';

import { useB3Lang } from '@/lib/lang';
import { themeFrameSelector, useAppSelector } from '@/store';

import { createDropin, DropinInstance } from '../dropin';

interface AddPaymentMethodProps {
  clientToken: string;
  onAdded: () => void;
}

function AddPaymentMethod({ clientToken }: AddPaymentMethodProps) {
  const b3Lang = useB3Lang();
  const iframeDocument = useAppSelector(themeFrameSelector);
  const [isOpen, setIsOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hasInitError, setHasInitError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<DropinInstance | null>(null);

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
      <div ref={containerRef} />
      <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
        <Button variant="contained" disabled={!isReady}>
          {b3Lang('paymentMethods.addCard.save')}
        </Button>
        <Button onClick={() => setIsOpen(false)}>{b3Lang('paymentMethods.addCard.cancel')}</Button>
      </Box>
    </Box>
  );
}

export default AddPaymentMethod;
