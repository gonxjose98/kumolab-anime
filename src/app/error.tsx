'use client';

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      textAlign: 'center',
      padding: '2rem',
    }}>
      <h1 style={{
        fontSize: '2rem',
        fontWeight: 700,
        color: '#e8e8f8',
        marginBottom: '0.75rem',
      }}>
        Something went wrong
      </h1>
      <p style={{
        fontSize: '1rem',
        color: '#a0a0c0',
        marginBottom: '2rem',
      }}>
        An unexpected error occurred.
      </p>
      <button
        onClick={reset}
        style={{
          padding: '0.75rem 2rem',
          background: 'rgba(123, 97, 255, 0.15)',
          border: '1px solid rgba(123, 97, 255, 0.3)',
          borderRadius: '8px',
          color: '#7b61ff',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Try Again
      </button>
    </div>
  );
}
