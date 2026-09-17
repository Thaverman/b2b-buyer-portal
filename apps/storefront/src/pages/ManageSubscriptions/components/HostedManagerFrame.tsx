import { useState } from 'react';
import { Box } from '@mui/material';

import B3Spin from '@/components/spin/B3Spin';
import { BigCommerceStorefrontAPIBaseURL } from '@/utils/basicConfig';

const SUBSCRIPTION_MANAGER_URL = `${BigCommerceStorefrontAPIBaseURL}/subscriptions?hideLayout=true`;

/** The pre-Phase-2 page, kept as the fallback while BC_CONTEXT.subscriptions.customManager is off. */
function HostedManagerFrame() {
  const [loading, setLoading] = useState(true);

  const handleIframeLoad = () => {
    setLoading(false);

    // Same-origin only: hide the theme chrome so the manager fills the frame. A cross-origin
    // frame throws here and keeps its chrome, which is acceptable for a fallback.
    try {
      const iframe = document.getElementById('subscriptions-iframe') as HTMLIFrameElement;
      const iframeDoc = iframe?.contentWindow?.document;
      if (iframeDoc) {
        const header = iframeDoc.querySelector('header');
        const footer = iframeDoc.querySelector('footer');

        if (header) (header as HTMLElement).style.display = 'none';
        if (footer) (footer as HTMLElement).style.display = 'none';
      }
    } catch {
      // cross-origin frame: leave it as it is
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

export default HostedManagerFrame;
