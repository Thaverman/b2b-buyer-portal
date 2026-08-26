import { ExpandMore } from '@mui/icons-material';
import { Accordion, AccordionDetails, AccordionSummary, Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { FAQ_SECTIONS } from '../faqContent';

import SectionHeader from './SectionHeader';

function FaqTab() {
  const b3Lang = useB3Lang();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionHeader>{b3Lang('loyalty.tabs.faq')}</SectionHeader>
      {FAQ_SECTIONS.map((section) => (
        <Box key={section.title}>
          <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700, mb: 1 }}>
            {section.title}
          </Typography>
          <Box>
            {section.items.map((item) => (
              <Accordion key={item.question} disableGutters>
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Typography sx={{ fontWeight: 700 }}>{item.question}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  {item.answer && (
                    <Typography variant="body2" color="text.secondary">
                      {item.answer}
                    </Typography>
                  )}
                  {item.bullets && (
                    <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                      {item.bullets.map((bullet) => (
                        <Typography
                          key={bullet}
                          component="li"
                          variant="body2"
                          color="text.secondary"
                        >
                          {bullet}
                        </Typography>
                      ))}
                    </Box>
                  )}
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

export default FaqTab;
