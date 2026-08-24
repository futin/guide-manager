import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, wrapPage, escapeHtml, breadcrumbBar, deckFrame } from '../server/lib/render.js';

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

test('relative md link with fragment rewrites to /guide and re-appends fragment', () => {
  const html = renderMarkdown('[install](setup.md#install)', '/proj/guides/a.md');
  const encoded = encodeURIComponent('/proj/guides/setup.md');
  assert.ok(html.includes(`/guide?p=${encoded}#install`));
});

test('relative md link with query rewrites to /guide, query discarded', () => {
  const html = renderMarkdown('[setup](setup.md?x=1)', '/proj/guides/a.md');
  const encoded = encodeURIComponent('/proj/guides/setup.md');
  assert.ok(html.includes(`/guide?p=${encoded}`));
  assert.ok(!html.includes('?x=1'));
});

test('data: URI image passes through untouched', () => {
  const html = renderMarkdown('![pic](data:image/png;base64,AAAA)', '/proj/guides/a.md');
  assert.ok(html.includes('src="data:image/png;base64,AAAA"'));
});

test('breadcrumbBar links back to the index and shows project, title and type', () => {
  const bar = breadcrumbBar({ project: 'guide-manager', title: 'Alpha Guide', type: 'study' });
  assert.ok(bar.includes('href="/"'));
  assert.ok(bar.includes('guide-manager'));
  assert.ok(bar.includes('Alpha Guide'));
  assert.ok(bar.includes('class="badge study"'));
});

test('breadcrumbBar omits project and badge when unknown', () => {
  const bar = breadcrumbBar({ title: 'orphan.md' });
  assert.ok(bar.includes('href="/"'));
  assert.ok(bar.includes('orphan.md'));
  assert.ok(!bar.includes('crumb-project'));
  assert.ok(!bar.includes('badge'));
});

test('breadcrumbBar escapes project, title and type', () => {
  const bar = breadcrumbBar({
    project: '<proj>',
    title: '<t>',
    type: 'study"><script>x</script>',
  });
  assert.ok(!bar.includes('<script>x</script>'));
  assert.ok(bar.includes('&lt;proj&gt;'));
  assert.ok(bar.includes('&lt;t&gt;'));
});

test('wrapPage puts the header before main', () => {
  const page = wrapPage('T', '<p>hi</p>', '<header class="topbar">bar</header>');
  assert.ok(page.indexOf('class="topbar"') < page.indexOf('<main>'));
});

test('deckFrame points an iframe at the verbatim asset url and focuses it', () => {
  const frame = deckFrame('/asset?p=%2Fx%2Fdeck.html', 'My Deck');
  assert.ok(frame.includes('src="/asset?p=%2Fx%2Fdeck.html"'));
  assert.ok(frame.includes('class="deck-frame"'));
  assert.ok(frame.includes('contentWindow.focus()'));
});

test('deckFrame escapes the title it puts in an attribute', () => {
  const frame = deckFrame('/asset?p=x', 'Deck" onload="x');
  assert.ok(!frame.includes('onload="x'));
});

test('wrapPage can set a body class', () => {
  assert.ok(wrapPage('T', '<p>hi</p>', '', { bodyClass: 'deck-host' }).includes('<body class="deck-host">'));
  assert.ok(wrapPage('T', '<p>hi</p>').includes('<body>'));
});
