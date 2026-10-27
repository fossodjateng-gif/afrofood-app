/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { load, findAll, harness } = require('./ui-harness.cjs');

const name = { de: 'Produit', fr: 'Produit', en: 'Product' };
const product = (id, imagePath) => ({ id, imagePath, name, price: 10, visible: true });
const sections = items => [{ id: 'food', title: name, items }];
const imageProps = tree => findAll(tree, el => el.props?.alt === name.de && el.props?.src)[0].props;
const text = tree => tree == null || typeof tree === 'boolean' ? '' : Array.isArray(tree) ? tree.map(text).join(' ') : typeof tree === 'object' ? text(tree.props?.children) : String(tree);

test('A/B/C/D: Menu et POS conservent les chemins configurés, personnalisés et logo provisoire', async () => {
  const originals = load('src/lib/menu-catalog.ts').MENU_CATALOG.flatMap(section => section.items).filter(item => item.imagePath).map(item => item.imagePath);
  for (const source of [...originals, '/photos/custom-special.jpg', '/logo-afrofood.png', undefined]) {
    const p = product('custom-special', source), before = JSON.stringify(p);
    const menu = harness('src/app/menu/page.tsx', { sections: sections([p]) }, { 'next/link': () => null });
    const menuImage = imageProps(menu.render());
    assert.equal(menuImage.src, source || '/logo-afrofood.png');
    const element = { dataset: {}, style: {}, src: menuImage.src };
    menuImage.onError({ currentTarget: element });
    assert.equal(element.src, '/logo-afrofood.png');
    const grid = harness('src/components/pos/ProductGrid.tsx');
    const added = [];
    const tree = grid.render(grid.component.ProductGrid, { lang: 'de', sections: sections([p]), categoryId: '', quantities: new Map(), onCategoryChange: () => {}, onAdd: item => added.push(item) });
    const add = findAll(tree, node => node.type === 'button' && node.props['aria-label']?.includes(name.de))[0];
    assert.equal(add.props.disabled, false);add.props.onClick();assert.deepEqual(added, [p]);
    const imageComponent = findAll(tree, el => el.type?.name === 'ProductImage')[0];
    const image = grid.render(imageComponent.type, imageComponent.props);
    assert.equal(imageProps(image).src, menuImage.src);
    assert.equal(JSON.stringify(p), before);
    imageProps(image).onError();
    assert.equal(imageProps(grid.render(imageComponent.type, imageComponent.props)).src, '/logo-afrofood.png');
    assert.equal(JSON.stringify(p), before);
  }
  // The extracted presentation must retain the real availability controls and
  // their revision token, without executing effects or calling an external API.
  const revision = JSON.stringify({ status: 'limited', remainingQty: 0, resumeAt: null });
  const p = { ...product('custom-special', '/photos/custom-special.jpg'), availability: { status: 'limited', remainingQty: 0, resumeAt: null, revision } };
  const page = harness('src/app/staff/cuisine/availability/page.tsx', { lang: 'fr', role: 'kitchen', eventId: 'event-a', sections: sections([p]) }, {
    'next/navigation': { useSearchParams: () => new URLSearchParams() },
  });
  const Page = page.render().props.children.type;
  const render = () => page.render(Page);
  const card = findAll(render(), node => node.type?.name === 'ProductPresentation')[0];
  assert.equal(card.props.imagePath, p.imagePath);assert.equal(card.props.name, name.fr);assert.equal(card.props.category, name.fr);
  assert.match(text(card), /information uniquement, vente toujours autorisee/);
  const quantity = findAll(card, node => node.type === 'input' && node.props.type === 'number')[0];
  assert.equal(quantity.props.value, 0);assert.ok(!quantity.props.disabled);
  quantity.props.onChange({ target: { value: '2' } });
  assert.equal(page.state.sections[0].items[0].availability.remainingQty, 2);
  assert.equal(page.state.sections[0].items[0].availability.revision, revision);
  const savedFetch = global.fetch, calls = [];
  global.fetch = async (...args) => { calls.push(args);return Response.json({ ok: true, revision: 'next-revision' }); };
  try {
    await findAll(render(), node => node.type === 'button' && text(node) === 'Enregistrer')[0].props.onClick();
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], '/api/admin/menu-config');assert.equal(calls[0][1].method, 'PATCH');
    assert.deepEqual(JSON.parse(calls[0][1].body), { setting: 'item_availability', expectedRevision: revision, itemId: p.id, eventId: 'event-a', status: 'limited', remainingQty: 2, resumeAt: null });
    assert.equal(page.state.sections[0].items[0].availability.revision, 'next-revision');
  } finally { global.fetch = savedFetch; }
  findAll(render(), node => node.type === 'select' && node.props.value === 'limited')[0].props.onChange({ target: { value: 'blocked' } });
  assert.equal(page.state.sections[0].items[0].availability.status, 'blocked');
  assert.equal(findAll(render(), node => node.type?.name === 'ProductPresentation')[0].props.tone, 'blocked');
});

test('E: catalogue et assets photo identiques à HEAD 91118345', () => {
  const head = execFileSync('git', ['show', '91118345:src/lib/menu-catalog.ts'], { encoding: 'utf8' });
  const headCatalog = [...head.matchAll(/imagePath: "([^"]+)"/g)].map(match => match[1]);
  const catalog = load('src/lib/menu-catalog.ts').MENU_CATALOG.flatMap(section => section.items);
  assert.deepEqual(catalog.filter(item => item.imagePath).map(item => item.imagePath), headCatalog);
  for (const image of headCatalog) assert.ok(fs.existsSync('public' + image), image);
  assert.equal(execFileSync('git', ['diff', '--name-only', '91118345', '--', 'public/assets/menu', 'public/logo-afrofood.png'], { encoding: 'utf8' }).trim(), '');
});

test('D/E: résolution serveur garde les photos catalogue et la convention des produits personnalisés sans écriture produit', async () => {
  const writes = [];
  const sql = async (strings, ...values) => {
    const q = strings.join('');
    if (/\b(UPDATE|DELETE|INSERT)\b/.test(q)) writes.push({ q, values });
    if (q.includes('FROM custom_menu_items')) return [{ item_id: 'custom-photo', section_id: 'custom-dishes', name_de: 'Custom', name_fr: 'Custom', name_en: 'Custom', price: 10, visible: true }];
    return [];
  };
  const settings = load('src/lib/menu-settings.ts', { '@/lib/db': { sql } });
  const resolved = await settings.getResolvedMenuSections('event-a');
  const items = resolved.flatMap(section => section.items);
  assert.equal(items.find(item => item.id === 'pollo-fino-2').imagePath, '/assets/menu/pollo-fino-2.png');
  assert.equal(items.find(item => item.id === 'custom-photo').imagePath, '/assets/menu/custom-photo.jpg');
  assert.equal(writes.length, 0);
});
