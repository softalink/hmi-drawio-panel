// Source-content transforms for the "Definition" buttons. prettify/minify are
// pure string ops; encode/decode reuse the bundled draw.io viewer's
// Graph.compress / Graph.decompress (same deflateRaw + base64 format the
// original plugin used), so no extra deps are needed. Callers must ensure the
// viewer is loaded (loadDrawio) before encode/decode.

// Indent XML for display/editing (equivalent of the original vkbeautify.xml).
export function prettify(xml: string): string {
  const reg = /(>)(<)(\/*)/g;
  const pad = '  ';
  let depth = 0;
  let out = '';
  xml
    .replace(reg, '$1\n$2$3')
    .trim()
    .split('\n')
    .forEach((node) => {
      let indent = 0;
      if (/.+<\/\w[^>]*>$/.test(node)) {
        indent = 0; // open and close on the same line
      } else if (/^<\/\w/.test(node)) {
        if (depth > 0) {
          depth -= 1; // closing tag
        }
      } else if (/^<\w[^>]*[^/]>.*$/.test(node)) {
        indent = 1; // opening tag (not self-closing)
      }
      out += pad.repeat(depth) + node + '\n';
      depth += indent;
    });
  return out.trim();
}

// Strip inter-tag whitespace (equivalent of the original vkbeautify.xmlmin).
export function minify(xml: string): string {
  return xml.replace(/>\s+</g, '><').trim();
}

// Compress raw XML to draw.io's deflateRaw+base64 form.
export function encode(xml: string): string {
  const Graph = (window as any).Graph;
  if (!Graph || typeof Graph.compress !== 'function') {
    throw new Error('draw.io viewer not loaded');
  }
  return Graph.compress(xml);
}

// Decompress a draw.io payload back to raw XML. Unwraps a full <mxfile>/<diagram>
// export first; if the content is not actually compressed, returns it unchanged.
export function decode(content: string): string {
  const w = window as any;
  const Graph = w.Graph;
  if (!Graph || typeof Graph.decompress !== 'function') {
    throw new Error('draw.io viewer not loaded');
  }
  let data = content.trim();
  try {
    const node = w.mxUtils.parseXml(data).documentElement;
    if (node && node.nodeName === 'mxfile') {
      const diagrams = node.getElementsByTagName('diagram');
      if (diagrams.length > 0) {
        data = (w.mxUtils.getTextContent(diagrams[0]) || '').trim();
      }
    } else if (node && (node.nodeName === 'mxGraphModel' || node.nodeName === 'diagram')) {
      // Already plain XML (or a bare <diagram> with a compressed body).
      if (node.nodeName === 'mxGraphModel') {
        return content;
      }
      data = (w.mxUtils.getTextContent(node) || '').trim();
    }
  } catch (e) {
    // Not parseable as XML — fall through and try to decompress the raw string.
  }
  const result = Graph.decompress(data);
  // Guard against turning valid content into garbage.
  return result && result.indexOf('<') !== -1 ? result : content;
}
