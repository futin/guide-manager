import {
  wrapPage, escapeHtml, breadcrumbBar, deckFrame
} from '../server/src/render/render.util';

describe('render', () => {
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

  it('the page shell does not load the reading aid', () => {
    // The shell holds a breadcrumb and an iframe, nothing else. Since bionic v3
    // runs without a panel, linking the aid here would decorate the one piece of
    // text on the page — the breadcrumb title — and never touch the guide, whose
    // prose is inside the frame and picks the aid up on its own way out.
    const page = wrapPage('T', deckFrame('/asset?p=x'), breadcrumbBar({ title: 'T' }), { bodyClass: 'deck-host' });
    expect(page).not.toContain('/bionic.js');
    expect(page).not.toContain('/bionic.css');
  });

  it('breadcrumbBar links back to the index and shows project, title and type', () => {
    const bar = breadcrumbBar({ project: 'guide-manager', title: 'Alpha Guide', type: 'study' });
    expect(bar).toContain('href="/"');
    expect(bar).toContain('guide-manager');
    expect(bar).toContain('Alpha Guide');
    expect(bar).toContain('class="badge study"');
  });

  it('breadcrumbBar back link leaves the viewer frame rather than loading the app inside it', () => {
    // The guide is read inside a same-origin iframe in the Guides tab. Without a
    // target, this link navigates the frame — so `/` renders the whole app inside
    // its own viewer, and every click from there nests one level deeper.
    const bar = breadcrumbBar({ title: 'Alpha Guide' });
    expect(bar).toMatch(/<a class="back"[^>]*target="_top"/);
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

  it('wrapPage stamps the saved theme before first paint', () => {
    const page = wrapPage('T', '<p>hi</p>');
    expect(page).toContain("localStorage.getItem('guide-manager.settings')");
    expect(page).toContain('dataset.theme');
    // The stamp must precede the stylesheets, or the first paint is unthemed.
    expect(page.indexOf('dataset.theme')).toBeLessThan(page.indexOf('href="/theme.css"'));
  });

  it('wrapPage links the theme tokens and the page styles', () => {
    const page = wrapPage('T', '<p>hi</p>');
    expect(page).toContain('href="/theme.css"');
    expect(page).toContain('href="/style.css"');
  });

  it('wrapPage emits no progress reporter — every guide scrolls inside its frame', () => {
    // An iframe's scroll is invisible to the host document, so a reporter on
    // this page would only ever measure a page that does not move. Guides count
    // as opened, which the client records when the card is tapped.
    expect(wrapPage('T', '<p>hi</p>')).not.toContain('/api/progress');
  });

  it('wrapPage can set a body class', () => {
    expect(wrapPage('T', '<p>hi</p>', '', { bodyClass: 'deck-host' })).toContain('<body class="deck-host">');
    expect(wrapPage('T', '<p>hi</p>')).toContain('<body>');
  });
});
