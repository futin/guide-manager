import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, wrapPage, escapeHtml } from '../server/lib/render.js';

test('renders basic markdown', () => {
  const html = renderMarkdown('# Hello', '/proj/guides/a.md');
  assert.match(html, /<h1[^>]*>Hello<\/h1>/);
});

test('rewrites relative image to /asset with absolute path', () => {
  const html = renderMarkdown('![pic](img.png)', '/proj/guides/a.md');
  assert.ok(html.includes(`/asset?p=${encodeURIComponent('/proj/guides/img.png')}`));
});

test('rewrites relative md link to /guide with absolute path', () => {
  const html = renderMarkdown('[next](sub/next.md)', '/proj/guides/a.md');
  assert.ok(html.includes(`/guide?p=${encodeURIComponent('/proj/guides/sub/next.md')}`));
});

test('leaves absolute http links and anchors untouched', () => {
  const html = renderMarkdown('[x](https://example.com) [y](#section)', '/proj/guides/a.md');
  assert.ok(html.includes('href="https://example.com"'));
  assert.ok(html.includes('href="#section"'));
});

test('escapeHtml escapes the five specials', () => {
  assert.equal(escapeHtml(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
});

test('wrapPage escapes title and links stylesheet', () => {
  const page = wrapPage('<Guides>', '<p>hi</p>');
  assert.ok(page.includes('<title>&lt;Guides&gt;</title>'));
  assert.ok(page.includes('href="/style.css"'));
  assert.ok(page.includes('<p>hi</p>'));
  assert.ok(page.includes('name="viewport"'));
});
