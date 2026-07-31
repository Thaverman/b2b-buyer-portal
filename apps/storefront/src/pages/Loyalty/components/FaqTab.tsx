import { ExpandMore } from '@mui/icons-material';
import { Accordion, AccordionDetails, AccordionSummary, Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyFaqSection } from '../api';

import SectionHeader from './SectionHeader';

interface FaqTabProps {
  sections: LoyaltyFaqSection[];
  intro: string;
}

function FaqTab({ sections, intro }: FaqTabProps) {
  const b3Lang = useB3Lang();

  // Keyed by position (not just the title/question) since theme config can repeat text.
  const keyedSections = sections.map((section, sectionIndex) => ({
    ...section,
    key: `${sectionIndex}-${section.title}`,
    items: section.items.map((item, itemIndex) => ({
      ...item,
      key: `${itemIndex}-${item.question}`,
      bullets: item.bullets.map((bullet, bulletIndex) => ({
        key: `${bulletIndex}-${bullet}`,
        text: bullet,
      })),
    })),
  }));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionHeader>{b3Lang('loyalty.tabs.faq')}</SectionHeader>
      <Typography sx={{ textAlign: 'center', color: 'text.secondary' }}>
        {intro || b3Lang('loyalty.faq.intro')}
      </Typography>
      {keyedSections.map((section) => (
        <Box key={section.key}>
          <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700, mb: 1 }}>
            {section.title}
          </Typography>
          <Box>
            {section.items.map((item) => (
              <Accordion key={item.key} disableGutters>
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Typography sx={{ fontWeight: 700 }}>{item.question}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  {item.answer && (
                    <Typography variant="body2" color="text.secondary">
                      {item.answer}
                    </Typography>
                  )}
                  {item.bullets.length > 0 && (
                    <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                      {item.bullets.map((bullet) => (
                        <Typography
                          key={bullet.key}
                          component="li"
                          variant="body2"
                          color="text.secondary"
                        >
                          {bullet.text}
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
