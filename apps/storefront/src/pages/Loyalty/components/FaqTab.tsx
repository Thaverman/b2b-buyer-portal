import { ExpandMore } from '@mui/icons-material';
import { Accordion, AccordionDetails, AccordionSummary, Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyFaqItem } from '../api';

import SectionHeader from './SectionHeader';

interface FaqTabProps {
  items: LoyaltyFaqItem[];
  intro: string;
}

function FaqTab({ items, intro }: FaqTabProps) {
  const b3Lang = useB3Lang();

  // Keyed by position (not just the question) since theme config can repeat a question.
  const keyedItems = items.map((item, index) => ({ ...item, key: `${index}-${item.question}` }));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionHeader>{b3Lang('loyalty.tabs.faq')}</SectionHeader>
      <Typography sx={{ textAlign: 'center', color: 'text.secondary' }}>
        {intro || b3Lang('loyalty.faq.intro')}
      </Typography>
      <Box>
        {keyedItems.map((item) => (
          <Accordion key={item.key} disableGutters>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography sx={{ fontWeight: 700 }}>{item.question}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" color="text.secondary">
                {item.answer}
              </Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>
    </Box>
  );
}

export default FaqTab;
