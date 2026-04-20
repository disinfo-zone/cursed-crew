import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { renderMarkdownLite } from './markdownLite.js';

describe('markdownLite', () => {
  it('escapes HTML in plain input', () => {
    const out = renderMarkdownLite('<script>alert(1)</script>');
    assert.equal(
      out,
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>'
    );
  });

  it('bolds and italicizes without permitting raw tags', () => {
    const out = renderMarkdownLite('A **bold** <b>tag</b> and *em*.');
    assert.ok(out.includes('<strong>bold</strong>'));
    assert.ok(out.includes('<em>em</em>'));
    assert.ok(out.includes('&lt;b&gt;tag&lt;/b&gt;'));
  });

  it('splits paragraphs on a blank line', () => {
    const out = renderMarkdownLite('One.\n\nTwo.');
    assert.equal(out, '<p>One.</p><p>Two.</p>');
  });

  it('single newline becomes a break', () => {
    const out = renderMarkdownLite('One\ntwo');
    assert.equal(out, '<p>One<br>two</p>');
  });

  it('escapes quotes so attribute-injection is impossible', () => {
    const out = renderMarkdownLite(`" onclick='alert(1)' "`);
    // The literal word "onclick" survives as plain text (it's not dangerous
    // on its own); what matters is that the surrounding quotes are escaped
    // so it can never land inside a real attribute context.
    assert.ok(out.includes('&quot;'), 'double-quote not escaped');
    assert.ok(out.includes('&#39;'), 'single-quote not escaped');
    assert.ok(!/["']/.test(out), 'raw quotes should never reach the output');
  });

  it('does not re-hydrate markup inside user text', () => {
    const out = renderMarkdownLite('<img src=x onerror=alert(1)>');
    assert.ok(!out.toLowerCase().includes('<img'));
  });
});
