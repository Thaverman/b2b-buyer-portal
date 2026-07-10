import { ReactNode } from 'react';
import { Typography } from '@mui/material';

interface SectionHeaderProps {
  children: ReactNode;
}

function SectionHeader({ children }: SectionHeaderProps) {
  return (
    <Typography
      variant="h6"
      component="h2"
      sx={{
        textAlign: 'center',
        textTransform: 'uppercase',
        fontWeight: 700,
        letterSpacing: 1,
        color: 'primary.main',
        my: 3,
      }}
    >
      {children}
    </Typography>
  );
}

export default SectionHeader;
