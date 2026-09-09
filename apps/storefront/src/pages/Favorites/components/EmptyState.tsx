import { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';

interface EmptyStateProps {
  message: string;
  children?: ReactNode;
}

export default function EmptyState({ message, children }: EmptyStateProps) {
  return (
    <Box sx={{ textAlign: 'center', py: 6 }}>
      <Typography sx={{ mb: 2 }}>{message}</Typography>
      {children && <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>{children}</Box>}
    </Box>
  );
}
