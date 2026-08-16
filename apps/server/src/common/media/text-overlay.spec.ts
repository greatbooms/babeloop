import { createCanvas } from '@napi-rs/canvas';
import {
  computeOverlayLayout,
  extractAccentColor,
  renderTextOverlay,
  resolveOverlayColor,
} from './text-overlay';
import { join } from 'path';

const TWENTY_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAFn0lEQVR42gXBCSDXhwLA8V85KpNqXWTJMYtJIiWlfyXLsz0VTw+lclSOCo3wSAnFP6kQapWQKxUlVk2MxHKXEBGLUXIsiiH1fZ+P8GdNJ7/nmvP1GlnMFtkyJzESJ1k79kn/SuQ7HcJl5mN6cw7jE3LMcnHGaHIt+0fvUKPXTcOlAJblX6T2fDAdn6JoLt+EsOd6Cl57p7Oyr4SFPqU0BW3H+sxhKl5cJmnPAk6viCfAS4mEOoG9F+sI+qRI+/2z5CzTwtXGldxNGwkxvoj0yWBuqcsiaFR+xFn/Hr+k3US3NIHWI81EDOXhntbB8Gp4eraWv5XjCG4OZaxCjKRfAjHXbtP4fIC1Y6349bzDN2EBbq4RFItfISxpcuPSYTNEWRqcCBpH2c8WqkawHIlArHIHq7VaXAs3Ia3hB6rfb+VJy3HCqpRZrVyGRQ4cMbXnxkQPcu+ymev2GcEzN4EZBZaohh1EwU6DlLgE7g6ewCdCkp2yxcgni4gvPIVMpSavRe5UVciRH/aWNttYUv8JosjkMYsGTzEUEcd1fz+EjyH9lLR1sWn4Df0/leFi1E26ty0vXUs4pFPHN45fUTmvkazPK1ihKWKmpg46rkU8kszFMNANEylznm+Zy7zZ/QRmGyLczwzk3kA1mRPtTAqdw4HpWrRcD+Fow1JKv2hj7xDKOnUrogdzKHeawvkFenSaSNH911amG+gztd+MP5a44h8iS5TRLoSHVcH0rp/M5td2bPMTc7s/gy3qb3C0LMJ26QX+KrHgQ0E3v7qd40qHHDYST3mxtI8fv8xFxVYe2URnPrUko6Tyiq7YcgShppjdrtvRW2xGT2sq+pOSkMj/npMpLmjnOJLRX8+bj9YsODiNO8292IW581XACAPnZTlsnc7Wyfp4DNYw2XOc/3mMIYTWWTHbKJj/RjdSkDqV0Rs7+edoP+9ql7OhsJibwQdQVKqh0CgcqQJFEk+lcKwglbolxUzrvkS9QQdqG9r4Tn8+5gUKCP8SZTOlWpvfvlPlmXQJE1E+aJWu5oy8NrFlu3m/b5Sz1cdI3lnBxfWNfKv7heUVHoyI03k1OsCFlM3Mb2/m1KEkHO7aIPw77zVrPCPZpSGPuncf6+OtuKoi4ufJIWge08W78AobX6RTFmPCQRsV3rYJLM4bYvvtQgZLtLjcZ8xPi6xZeiCNvFJ/hHOKSmQ/mISx4gUeJPnwuH2Y/7gYEGfRy+cWMav6KzDY8oDvO8s4vkqdPgMPdtS58KXTmx/yJfjzwxi/x2rxdcYIZhlZCHNiA3AKnMG+kiYiQzYQXjuI6a0sxqeZMmuWO0bxAewXP6fmrD0NVkUsU66mNs+OjoxKmqNV2dPWidc8B1b2iFm4JQmh6cQ41rUxVHwrS5K5B6dlCggweUuCx0n2RmsSlPiQdgUfchaG4uqwg9x8NUKWX0G6JJ9bImM0ZmbinOfKL8vV0B14htAa9YQIiVW4h2xk2GuUp97a/F18gWDpasZmqyKp7UlMvTeNW/ez1vIzfu5S+O4+hNvKZoqHjrJE24tLZTGIKvU5MaaOoHzlMdxSx9IpBnHmMaz0RFwbayItuoFqcS9PEi0Iq9ZitXY+FjuucqT1GTciZZEzNWCuWi+eCs7MaCtAVV8SBfUChJRKY+4mj+MT7svOrr3Ip88mHltk5ON4vfgyVVcNybf5QNuIM6nviyjqMWSRpTFDfqe5HuLEx9GfKan9kU16cvTvkUJwOT6T9OEJXo74cMhGiW9811G5uJmsl2qscLRnplwyOjL1PNJtxrBsDSa/SfA8yJ955+IInHqN+zrm3MveRmZ5JpP65RAOON6nZfwMR4emUOr7CPuTJqyTrid61wvK+zZzfoYbnXn+dCeZM/2pNVNz5PhDuwv/c4VEdcXx0OEBvc/U2SwaZJuuMv8HyMTySoaYCFMAAAAASUVORK5CYII=',
  'base64',
);

describe('computeOverlayLayout', () => {
  it('wraps a headline into at most two CJK-width lines around the square anchor', () => {
    expect(
      computeOverlayLayout({
        width: 400,
        height: 400,
        group: 'square',
        headline: '가'.repeat(35),
      }),
    ).toEqual({
      lines: [
        { text: '가'.repeat(18), fontSize: 20, y: 273 },
        { text: '가'.repeat(17), fontSize: 20, y: 300 },
      ],
    });
  });

  it('shrinks an overflowing two-line headline by ten percent down to a fitting size', () => {
    expect(
      computeOverlayLayout({
        width: 400,
        height: 500,
        group: 'portrait',
        headline: '文'.repeat(37),
      }),
    ).toEqual({
      lines: [
        { text: '文'.repeat(20), fontSize: 18, y: 369 },
        { text: '文'.repeat(17), fontSize: 18, y: 393 },
      ],
    });
  });

  it('keeps the subline on one line, shrinking it independently around the banner anchor', () => {
    expect(
      computeOverlayLayout({
        width: 300,
        height: 100,
        group: 'banner',
        headline: '標題',
        subline: '副'.repeat(40),
      }),
    ).toEqual({
      lines: [
        { text: '標題', fontSize: 16, y: 35 },
        { text: '副'.repeat(40), fontSize: 6, y: 59 },
      ],
    });
  });
});

describe('renderTextOverlay', () => {
  const configurableRender = renderTextOverlay as unknown as (
    buffer: Buffer,
    layout: ReturnType<typeof computeOverlayLayout>,
    options: { font: string; color: string },
  ) => Promise<Buffer>;

  it('renders a valid PNG whose bytes differ from the clean input', async () => {
    const layout = computeOverlayLayout({
      width: 20,
      height: 20,
      group: 'banner',
      headline: '字',
    });

    const originalCwd = process.cwd();
    process.chdir(join(__dirname, '../../../../..'));
    let rendered: Buffer;
    try {
      rendered = await renderTextOverlay(TWENTY_PIXEL_PNG, layout);
    } finally {
      process.chdir(originalCwd);
    }

    expect(rendered.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(rendered.equals(TWENTY_PIXEL_PNG)).toBe(false);
  });

  it('renders serif gold differently from the default gothic white style', async () => {
    const layout = computeOverlayLayout({
      width: 20,
      height: 20,
      group: 'banner',
      headline: '字',
    });

    const originalCwd = process.cwd();
    process.chdir(join(__dirname, '../../../../..'));
    let defaultRendered: Buffer;
    let styledRendered: Buffer;
    try {
      defaultRendered = await renderTextOverlay(TWENTY_PIXEL_PNG, layout);
      styledRendered = await configurableRender(TWENTY_PIXEL_PNG, layout, {
        font: 'serif',
        color: 'gold',
      });
    } finally {
      process.chdir(originalCwd);
    }

    expect(styledRendered.equals(defaultRendered)).toBe(false);
  });

  it('rejects an unknown font key', async () => {
    const layout = computeOverlayLayout({
      width: 20,
      height: 20,
      group: 'banner',
      headline: '字',
    });

    await expect(
      configurableRender(TWENTY_PIXEL_PNG, layout, {
        font: 'unknown',
        color: 'white',
      }),
    ).rejects.toThrow('지원하지 않는 오버레이 폰트');
  });
});

describe('overlay colors', () => {
  it('extracts the saturated accent block instead of the gray background', async () => {
    const canvas = createCanvas(64, 64);
    const context = canvas.getContext('2d');
    context.fillStyle = '#777777';
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = '#D4A62A';
    context.fillRect(16, 16, 32, 32);

    await expect(extractAccentColor(canvas.toBuffer('image/png'))).resolves.toEqual({
      fill: '#D4A62A',
      shadow: 'rgba(0,0,0,0.6)',
    });
  });

  it('falls back to white when fewer than two percent of pixels are eligible', async () => {
    const canvas = createCanvas(64, 64);
    const context = canvas.getContext('2d');
    context.fillStyle = '#777777';
    context.fillRect(0, 0, 64, 64);

    await expect(extractAccentColor(canvas.toBuffer('image/png'))).resolves.toEqual({
      fill: '#FFFFFF',
      shadow: 'rgba(0,0,0,0.55)',
    });
  });

  it('resolves a custom hex color and leaves auto for the caller to extract', () => {
    expect(resolveOverlayColor('#102030')).toEqual({
      fill: '#102030',
      shadow: 'rgba(255,255,255,0.35)',
    });
    expect(resolveOverlayColor('auto')).toBeNull();
  });
});
