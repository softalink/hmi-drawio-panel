import { prettify, minify } from './xml';

const SAMPLE = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>';

describe('xml prettify/minify', () => {
  it('prettify expands tags onto indented lines', () => {
    const out = prettify(SAMPLE);
    expect(out.split('\n').length).toBeGreaterThan(1);
    expect(out).toContain('<root>');
    expect(out).toMatch(/\n {2}<root>/); // root indented under mxGraphModel
  });

  it('minify strips inter-tag whitespace', () => {
    const pretty = prettify(SAMPLE);
    expect(pretty).toContain('\n');
    const mini = minify(pretty);
    expect(mini).not.toContain('\n');
    expect(mini).not.toMatch(/>\s+</);
  });

  it('prettify then minify round-trips to a single line equivalent', () => {
    expect(minify(prettify(SAMPLE))).toBe(SAMPLE);
  });
});
