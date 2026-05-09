import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0a0f1e 0%, #0f172a 40%, #111827 100%)',
        }}
      >
        {/* Background grid */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            opacity: 0.04,
          }}
        >
          <div
            style={{
              fontSize: '400px',
              color: '#06b6d4',
              fontWeight: 900,
              letterSpacing: '-20px',
            }}
          >
            TWINFORGE
          </div>
        </div>

        {/* Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div style={{ fontSize: '80px', fontWeight: 900, color: '#ffffff', letterSpacing: '-2px' }}>
            TwinForge
          </div>
          <div style={{ fontSize: '28px', color: '#94a3b8', fontWeight: 400 }}>
            Real-Time Digital Twin Simulation Platform
          </div>
          <div
            style={{
              fontSize: '16px',
              color: '#06b6d4',
              fontWeight: 500,
              marginTop: '8px',
              padding: '8px 20px',
              background: 'rgba(6, 182, 212, 0.1)',
              borderRadius: '8px',
            }}
          >
            Enterprise-grade  ·  AI-Powered  ·  GPU-Accelerated
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
