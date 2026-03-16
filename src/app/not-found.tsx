import Link from 'next/link';

export default function NotFound() {
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
        fontSize: '6rem',
        fontWeight: 800,
        background: 'linear-gradient(to right, #7b61ff, #00d4ff)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        marginBottom: '0.5rem',
        lineHeight: 1,
      }}>
        404
      </h1>
      <p style={{
        fontSize: '1.25rem',
        color: '#a0a0c0',
        marginBottom: '2rem',
      }}>
        This page doesn&apos;t exist.
      </p>
      <Link
        href="/"
        style={{
          padding: '0.75rem 2rem',
          background: 'rgba(123, 97, 255, 0.15)',
          border: '1px solid rgba(123, 97, 255, 0.3)',
          borderRadius: '8px',
          color: '#7b61ff',
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        Back to Home
      </Link>
    </div>
  );
}
