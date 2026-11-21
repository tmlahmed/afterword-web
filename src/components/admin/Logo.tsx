import React from 'react'

/** The AFTERWORD logo on the admin sign-in page. Turned white when the admin is in dark mode. */
export const AdminLogo: React.FC = () => (
  <>
    <style>{`html[data-theme='dark'] .aw-admin-logo { filter: invert(1); }`}</style>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="aw-admin-logo" src="/brand/afterword-logo.svg" alt="AFTERWORD" width={260} height={30} style={{ height: 30, width: 'auto' }} />
  </>
)

/** The AFTERWORD icon in the admin's top-left corner, in place of Payload's mark. */
export const AdminIcon: React.FC = () => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src="/brand/afterword-icon-mark.svg" alt="AFTERWORD" width={24} height={24} style={{ width: 24, height: 24, borderRadius: 4, display: 'block' }} />
)
