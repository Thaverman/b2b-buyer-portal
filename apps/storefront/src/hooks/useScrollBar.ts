import { useEffect } from 'react';
import { useDispatch } from 'react-redux';

import { updateOverflowStyle } from '@/store';

const useScrollBar = (open: boolean) => {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(updateOverflowStyle(open ? 'hidden' : 'initial'));

    // An owner that unmounts while its dialog is open never gets to close it, so release here.
    return () => {
      if (open) {
        dispatch(updateOverflowStyle('initial'));
      }
    };
    // ignore dispatch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
};

export { useScrollBar };
