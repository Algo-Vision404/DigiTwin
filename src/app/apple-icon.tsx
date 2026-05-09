import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '36px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
          border: '2px solid rgba(6, 182, 212, 0.3)',
        }}
      >
        <span
          style={{
            fontSize: '90px',
            fontWeight: 900,
            fontFamily: 'Arial, sans-serif',
            letterSpacing: '-2px',
            background: 'linear-gradient(90deg, #06b6d4, #3b82f6, #8b5cf6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          TW
        </span>
      </div>
    ),
    {
      ...size,
    }
  );
}
