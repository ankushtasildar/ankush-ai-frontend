import { useEffect, useRef } from 'react';

export default function LandingPage() {
  const ref = useRef(null);

  useEffect(() => {
    // Make iframe fill entire viewport, hide parent scrollbar
    document.body.style.overflow = 'hidden';
    document.body.style.margin = '0';
    return () => {
      document.body.style.overflow = '';
      document.body.style.margin = '';
    };
  }, []);

  return (
    <iframe
      ref={ref}
      src="/landing.html"
      style={{
        width: '100vw',
        height: '100vh',
        border: 'none',
        display: 'block',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 9999
      }}
      title="AnkushAI Landing"
    />
  );
}
