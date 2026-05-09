import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '6px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
        }}
      >
        <span
          style={{
            fontSize: '20px',
            fontWeight: 900,
            fontFamily: 'Arial, sans-serif',
            letterSpacing: '-0.5px',
            background: 'linear-gradient(90deg, #06b6d4, #3b82f6)',
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
