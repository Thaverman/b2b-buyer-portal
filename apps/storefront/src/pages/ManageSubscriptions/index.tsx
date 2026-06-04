import { ReactElement, useState } from 'react';
import { Box } from '@mui/material';

import B3Spin from '@/components/spin/B3Spin';
import { PageProps } from '@/pages/PageProps';
import { BigCommerceStorefrontAPIBaseURL } from '@/utils/basicConfig';

const SUBSCRIPTION_MANAGER_URL = `${BigCommerceStorefrontAPIBaseURL}/subscriptions?hideLayout=true`;

export default function ManageSubscriptions(_props: PageProps): ReactElement {
  const [loading, setLoading] = useState(true);

  const handleIframeLoad = () => {
    setLoading(false);

    try {
      const iframe = document.getElementById('subscriptions-iframe') as HTMLIFrameElement;
      if (iframe?.contentWindow?.document) {
        const iframeDoc = iframe.contentWindow.document;

        const header = iframeDoc.querySelector('header');
        const footer = iframeDoc.querySelector('footer');

        if (header) (header as HTMLElement).style.display = 'none';
        if (footer) (footer as HTMLElement).style.display = 'none';
      }
    } catch (error) {
      console.warn('Unable to modify iframe content due to cross-origin restrictions:', error);
    }
  };

  return (
    <B3Spin isSpinning={loading}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: '800px',
          position: 'relative',
        }}
      >
        <div id="og-msi" />
        <iframe
          id="subscriptions-iframe"
          src={SUBSCRIPTION_MANAGER_URL}
          style={{ width: '100%', height: '100%', border: 'none', minHeight: '800px' }}
          title="Manage Subscriptions"
          onLoad={handleIframeLoad}
        />
      </Box>
    </B3Spin>
  );
}
