import React from 'react'

/** Download link above the subscriber list. */
export const SubscribersExport: React.FC = () => (
  <p style={{ margin: '0 0 1.25rem' }}>
    <a href="/api/subscribers/export.csv">Download everyone subscribed (CSV)</a> — to import into Brevo, Mailchimp or another email service.
    People who unsubscribe here are left out.
  </p>
)
