import {
  renderMarkdown, wrapPage, escapeHtml, breadcrumbBar, deckFrame
} from '../server/src/render/render.util';

describe('render', () => {
  it('renders basic markdown', () => {
    const html = renderMarkdown('# Hello', '/proj/guides/a.md');
    expect(html).toMatch(/<h1[^>]*>Hello<\/h1>/);
  });

  it('rewrites relative image to /asset with absolute path', () => {
    const html = renderMarkdown('![pic](img.png)', '/proj/guides/a.md');
    expect(html).toContain(`/asset?p=${encodeURIComponent('/proj/guides/img.png')}`);
  });

  it('rewrites relative md link to /guide with absolute path', () => {
    const html = renderMarkdown('[next](sub/next.md)', '/proj/guides/a.md');
    expect(html).toContain(`/guide?p=${encodeURIComponent('/proj/guides/sub/next.md')}`);
  });

  it('leaves absolute http links and anchors untouched', () => {
    const html = renderMarkdown('[x](https://example.com) [y](#section)', '/proj/guides/a.md');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('href="#section"');
  });

  it('escapeHtml escapes the five specials', () => {
    expect(escapeHtml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;');
  });

  it('wrapPage escapes title and links stylesheet', () => {
    const page = wrapPage('<Guides>', '<p>hi</p>');
    expect(page).toContain('<title>&lt;Guides&gt;</title>');
    expect(page).toContain('href="/style.css"');
    expect(page).toContain('<p>hi</p>');
    expect(page).toContain('name="viewport"');
  });

  it('wrapPage still links the stylesheet at /style.css', () => {
    expect(wrapPage('T', '<p>hi</p>')).toContain('href="/style.css"');
  });

  it('relative md link with fragment rewrites to /guide and re-appends fragment', () => {
    const html = renderMarkdown('[install](setup.md#install)', '/proj/guides/a.md');
    const encoded = encodeURIComponent('/proj/guides/setup.md');
    expect(html).toContain(`/guide?p=${encoded}#install`);
  });

  it('relative md link with query rewrites to /guide, query discarded', () => {
    const html = renderMarkdown('[setup](setup.md?x=1)', '/proj/guides/a.md');
    const encoded = encodeURIComponent('/proj/guides/setup.md');
    expect(html).toContain(`/guide?p=${encoded}`);
    expect(html).not.toContain('?x=1');
  });

  it('data: URI image passes through untouched', () => {
    const html = renderMarkdown('![pic](data:image/png;base64,AAAA)', '/proj/guides/a.md');
    expect(html).toContain('src="data:image/png;base64,AAAA"');
  });

  it('breadcrumbBar links back to the index and shows project, title and type', () => {
    const bar = breadcrumbBar({ project: 'guide-manager', title: 'Alpha Guide', type: 'study' });
    expect(bar).toContain('href="/"');
    expect(bar).toContain('guide-manager');
    expect(bar).toContain('Alpha Guide');
    expect(bar).toContain('class="badge study"');
  });

  it('breadcrumbBar omits project and badge when unknown', () => {
    const bar = breadcrumbBar({ title: 'orphan.md' });
    expect(bar).toContain('href="/"');
    expect(bar).toContain('orphan.md');
    expect(bar).not.toContain('crumb-project');
    expect(bar).not.toContain('badge');
  });

  it('breadcrumbBar escapes project, title and type', () => {
    const bar = breadcrumbBar({
      project: '<proj>',
      title: '<t>',
      // A hand-edited registry is the threat here, so the escaping is tested
      // with a value the type system would not normally allow.
      type: 'study"><script>x</script>' as never
    });
    expect(bar).not.toContain('<script>x</script>');
    expect(bar).toContain('&lt;proj&gt;');
    expect(bar).toContain('&lt;t&gt;');
  });

  it('wrapPage puts the header before main', () => {
    const page = wrapPage('T', '<p>hi</p>', '<header class="topbar">bar</header>');
    expect(page.indexOf('class="topbar"')).toBeLessThan(page.indexOf('<main'));
  });

  it('deckFrame points an iframe at the verbatim asset url and focuses it', () => {
    const frame = deckFrame('/asset?p=%2Fx%2Fdeck.html', 'My Deck');
    expect(frame).toContain('src="/asset?p=%2Fx%2Fdeck.html"');
    expect(frame).toContain('class="deck-frame"');
    expect(frame).toContain('contentWindow.focus()');
  });

  it('deckFrame escapes the title it puts in an attribute', () => {
    const frame = deckFrame('/asset?p=x', 'Deck" onload="x');
    expect(frame).not.toContain('onload="x');
  });

  it('wrapPage can set a body class', () => {
    expect(wrapPage('T', '<p>hi</p>', '', { bodyClass: 'deck-host' })).toContain('<body class="deck-host">');
    expect(wrapPage('T', '<p>hi</p>')).toContain('<body>');
  });
});
