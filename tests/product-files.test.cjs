/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const sharp = require('sharp');
const { load, harness, findAll } = require('./ui-harness.cjs');

const pdf = () => new File(['%PDF-1.7\nfixture\n%%EOF\n'], 'details.pdf', { type: 'application/pdf' });
const png = async () => new File([await sharp({ create: { width: 1600, height: 800, channels: 3, background: 'red' } }).png().toBuffer()], 'photo.png', { type: 'image/png' });

test('file validation: decode and optimize images; reject mismatched MIME, signatures, corrupt and oversized files', async () => {
  const { validateProductFile } = load('src/lib/product-file-validation.ts', { '@/lib/db': {} });
  const optimized = await validateProductFile(await png(), 'image');
  assert.equal(optimized.contentType, 'image/webp');
  const image = await sharp(optimized.bytes).metadata();
  assert.equal(image.width, 1200); assert.equal(image.height, 600);
  for (const format of ['jpeg', 'webp']) {
    const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: 'blue' } })[format]().toBuffer();
    assert.equal((await validateProductFile(new File([bytes], `image.${format}`, { type: `image/${format}` }), 'image')).contentType, 'image/webp');
  }
  assert.equal((await validateProductFile(pdf(), 'pdf')).extension, 'pdf');
  for (const [file, kind] of [
    [new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' }), 'image'],
    [new File(['bad'], 'a.png', { type: 'image/png' }), 'image'],
    [new File([Buffer.from([255, 216, 255])], 'a.jpg', { type: 'image/jpeg' }), 'image'],
    [new File(['%PDF-1.7\n%%EOF'], 'a.jpg', { type: 'image/jpeg' }), 'image'],
    [new File(['%PDF-1.7\n%%EOF'], 'a.pdf', { type: 'text/plain' }), 'pdf'],
    [new File(['%PDF-1.7\ntruncated'], 'a.pdf', { type: 'application/pdf' }), 'pdf'],
    [new File([''], 'a.pdf', { type: 'application/pdf' }), 'pdf'],
    [new File([new Uint8Array(4_000_001)], 'a.pdf', { type: 'application/pdf' }), 'pdf'],
  ]) await assert.rejects(validateProductFile(file, kind), error => [413, 415].includes(error.status));
});

async function fixture(t) {
  assert.ok(process.env.AFROFOOD_PGLITE_MODULE, 'Set AFROFOOD_PGLITE_MODULE to the existing offline PGlite installation');
  const { PGlite } = require(process.env.AFROFOOD_PGLITE_MODULE);
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`CREATE TABLE staff_users (id TEXT PRIMARY KEY, username TEXT, role TEXT, active BOOLEAN, cashier_event_id TEXT, workstation_id TEXT);
    CREATE TABLE staff_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, revoked_at TIMESTAMPTZ, expires_at TIMESTAMPTZ);
    CREATE TABLE app_settings (setting_key TEXT PRIMARY KEY, setting_value JSONB, updated_at TIMESTAMPTZ);
    CREATE TABLE custom_menu_items (item_id TEXT PRIMARY KEY);
    INSERT INTO custom_menu_items VALUES ('fixture-product');`);
  const source = readFileSync('scripts/add_staff_workstations.sql', 'utf8');
  await db.exec(source.slice(source.indexOf('CREATE OR REPLACE FUNCTION af_assert_staff_admin'), source.indexOf('CREATE OR REPLACE FUNCTION af_assert_staff_assignment')));
  const queries = [], state = { failPut: false, failDelete: false, failLookup: false, failTransaction: '', beforeTransaction: null };
  const blobs = new Map(), deleted = [], uploads = [];
  const execute = async query => {
    const text = query.strings.reduce((out, part, i) => out + part + (i < query.values.length ? `$${i + 1}` : ''), '');
    queries.push(text);
    if (state.failLookup && text.includes("setting_value->>'pathname'")) throw Error('uncertain references');
    return (await db.query(text, query.values)).rows;
  };
  const sql = (strings, ...values) => ({ strings, values, then(resolve, reject) { return execute(this).then(resolve, reject); } });
  sql.transaction = async statements => {
    if (state.beforeTransaction) { const action = state.beforeTransaction; state.beforeTransaction = null; await action(); }
    if (state.failTransaction === 'before') throw Error('private database detail');
    await db.exec('BEGIN ISOLATION LEVEL SERIALIZABLE');
    try {
      const results = []; for (const query of statements) results.push(await execute(query));
      await db.exec('COMMIT');
      if (state.failTransaction === 'after') throw Error('commit response lost');
      return results;
    } catch (error) { if (state.failTransaction !== 'after') await db.exec('ROLLBACK'); throw error; }
  };
  const mocks = {
    '@/lib/db': { sql },
    '@/lib/workstations-server': { assignedWorkstation: async (role, event, id) => { if (role !== 'admin' && (!event || !id)) throw Error('assignment'); return { id, name: id, type: role }; } },
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@vercel/blob': {
      put: async (pathname, bytes, options) => {
        uploads.push({ pathname, options });
        assert.equal(options.access, 'private'); assert.equal(options.addRandomSuffix, false);
        blobs.set(pathname, bytes);
        if (state.failPut) throw Error('private storage detail');
        return { pathname };
      },
      del: async pathname => { if (state.failDelete) throw Error('unavailable'); deleted.push(pathname); blobs.delete(pathname); },
      get: async (pathname, options) => {
        assert.equal(options.access, 'private');
        return blobs.has(pathname) ? { statusCode: 200, stream: new Blob([blobs.get(pathname)]).stream() } : null;
      },
    },
  };
  const cache = new Map(), auth = load('src/lib/staff-session-server.ts', mocks, cache);
  const tokens = { admin: 'a'.repeat(64), cashier: 'b'.repeat(64), kitchen: 'c'.repeat(64) };
  for (const [role, token] of Object.entries(tokens)) {
    await db.query('INSERT INTO staff_users VALUES ($1,$1,$1,TRUE,$2,$3)', [role, role === 'admin' ? null : 'event-a', role === 'admin' ? null : 'station']);
    await db.query("INSERT INTO staff_sessions VALUES ($1,$2,NULL,NOW()+interval '1 hour')", [auth.tokenHash(token), role]);
  }
  const request = (method, body, role = 'admin', path = '/api/admin/product-files', extra = {}) => new Request(`https://fixture.test${path}`, {
    method, headers: { origin: 'https://fixture.test', ...(role ? { cookie: `af_staff_session=${tokens[role]}` } : {}), ...extra }, ...(body === undefined ? {} : { body }),
  });
  const api = load('src/app/api/admin/product-files/route.ts', mocks, cache);
  const reader = load('src/app/api/product-files/[productId]/[kind]/route.ts', mocks, cache);
  const metadata = load('src/lib/product-files-metadata.ts', mocks, cache);
  async function upload(file = pdf(), expectedVersion = '', kind = 'pdf', role = 'admin', id = 'fixture-product') {
    const form = new FormData(); form.set('file', file); form.set('kind', kind); form.set('productId', id); form.set('expectedVersion', expectedVersion);
    return api.POST(request('POST', form, role));
  }
  const remove = (expectedVersion, kind = 'pdf') => api.DELETE(request('DELETE', JSON.stringify({ productId: 'fixture-product', kind, expectedVersion })));
  const read = (kind, role = 'admin', query = '') => reader.GET(request('GET', undefined, role, `/api/product-files/fixture-product/${kind}${query}`), { params: Promise.resolve({ productId: 'fixture-product', kind }) });
  return { db, auth, state, blobs, deleted, uploads, queries, api, request, upload, remove, read, metadata, mocks };
}

test('private files: real SQL lifecycle, auth, origin, safe URLs, image override and catalog fallback', async t => {
  const f = await fixture(t);
  for (const role of ['', 'cashier', 'kitchen']) {
    assert.ok([401, 403].includes((await f.upload(pdf(), '', 'pdf', role)).status));
    assert.ok([401, 403].includes((await f.api.GET(f.request('GET', undefined, role, '/api/admin/product-files?productId=fixture-product'))).status));
  }
  assert.equal((await f.api.DELETE(f.request('DELETE', '{}', 'admin', undefined, { origin: 'https://foreign.test' }))).status, 403);
  assert.equal(f.uploads.length, 0);
  assert.equal((await f.upload(pdf(), '', 'pdf', 'admin', '../bad')).status, 400);
  assert.equal((await f.upload(pdf(), '', 'pdf', 'admin', 'missing')).status, 404);
  const first = await f.upload(); assert.equal(first.status, 200);
  const body = await first.json(); assert.equal(body.cleanupPending, false);
  assert.doesNotMatch(JSON.stringify(body), /pathname|blob\.vercel|token/);
  const stored = await f.metadata.readProductFile('fixture-product', 'pdf');
  assert.match(stored.pathname, /^product-files\/fixture-product\/[a-f0-9-]+\.pdf$/);
  const response = await f.read('pdf'); assert.equal(response.status, 200);
  assert.equal(await response.text(), await pdf().text());
  assert.match(response.headers.get('cache-control'), /no-store/); assert.match(response.headers.get('content-security-policy'), /sandbox/);
  for (const role of ['', 'cashier', 'kitchen']) assert.ok([401, 403].includes((await f.read('pdf', role)).status));
  assert.equal((await f.read('pdf', 'admin', '?v=stale')).status, 404);
  assert.equal((await f.upload(pdf(), 'stale')).status, 409);
  const replacement = await f.upload(pdf(), body.asset.version); assert.equal(replacement.status, 200);
  assert.ok(f.deleted.includes(stored.pathname));
  const replaced = await replacement.json();
  assert.equal((await f.remove(body.asset.version)).status, 409);
  assert.equal((await f.remove(replaced.asset.version)).status, 200);
  assert.equal((await f.read('pdf')).status, 404);
  // JSON null tombstones must support another upload and removal.
  assert.equal((await f.upload()).status, 200);
  const image = await f.upload(await png(), '', 'image'); assert.equal(image.status, 200);
  assert.equal((await f.read('image', 'cashier', '?eventId=other')).status, 403);
  for (const role of ['admin', 'cashier', 'kitchen']) assert.equal((await f.read('image', role)).status, 200);
  const paths = await f.metadata.productImagePaths('event-a'); assert.match(paths.get('fixture-product'), /&eventId=event-a$/);
  const summary = await (await f.api.GET(f.request('GET', undefined, 'admin', '/api/admin/product-files?productId=fixture-product'))).json();
  assert.equal(summary.fallbackImageUrl, '/assets/menu/fixture-product.jpg');
  assert.doesNotMatch(JSON.stringify(summary), /pathname|blob\.vercel|token/);
  assert.ok(f.queries.every(query => !/CREATE|ALTER|DROP|UPDATE orders|DELETE FROM staff/i.test(query)));
});

test('private files: uncertain commit, upload failure, cleanup failure, concurrent update and revoked admin', async t => {
  const f = await fixture(t);
  f.state.failPut = true;
  const failed = await f.upload(); assert.equal(failed.status, 503); assert.equal(f.blobs.size, 0);
  assert.doesNotMatch(JSON.stringify(await failed.json()), /private storage detail/);
  f.state.failPut = false; f.state.failTransaction = 'before';
  assert.equal((await f.upload()).status, 503); assert.equal(f.blobs.size, 0);
  f.state.failLookup = true;
  assert.equal((await f.upload()).status, 503); assert.equal(f.blobs.size, 1, 'an uncertain reference lookup must never delete a blob');
  f.state.failLookup = false;
  f.state.failTransaction = 'after';
  assert.equal((await f.upload()).status, 503);
  let stored = await f.metadata.readProductFile('fixture-product', 'pdf');
  assert.ok(f.blobs.has(stored.pathname), 'uncertain commit must keep the referenced blob');
  f.state.failTransaction = ''; f.state.failDelete = true;
  const replaced = await f.upload(pdf(), stored.version); assert.equal(replaced.status, 200);
  assert.equal((await replaced.json()).cleanupPending, true); assert.ok(f.blobs.has(stored.pathname));
  f.state.failDelete = false;
  stored = await f.metadata.readProductFile('fixture-product', 'pdf');
  f.state.beforeTransaction = () => f.db.query("UPDATE app_settings SET setting_value='null'::jsonb WHERE setting_key='product-files:fixture-product:pdf'");
  assert.equal((await f.upload(pdf(), stored.version)).status, 409);
  assert.ok(f.blobs.has(stored.pathname));
  f.state.beforeTransaction = () => f.db.query("UPDATE staff_sessions SET revoked_at=NOW() WHERE user_id='admin'");
  assert.equal((await f.upload()).status, 503);
  assert.equal(await f.metadata.readProductFile('fixture-product', 'pdf'), null);
});

test('private files: reject corrupt metadata and bounded malformed requests without Blob calls', async t => {
  const f = await fixture(t);
  for (const body of ['null', '[]', '{', '{}']) assert.equal((await f.api.DELETE(f.request('DELETE', body))).status, 400);
  assert.equal((await f.api.DELETE(f.request('DELETE', ' '.repeat(4097)))).status, 413);
  assert.equal((await f.api.POST(f.request('POST', 'invalid', 'admin', undefined, { 'content-type': 'multipart/form-data' }))).status, 400);
  assert.equal((await f.api.POST(f.request('POST', new Uint8Array(4_064_001), 'admin', undefined, { 'content-length': '1' }))).status, 413);
  assert.equal((await f.upload(new File(['bad'], 'a.pdf', { type: 'application/pdf' }))).status, 415);
  assert.equal(f.uploads.length, 0);
  await f.upload();
  const asset = await f.metadata.readProductFile('fixture-product', 'pdf');
  for (const patch of [{ pathname: 'https://example.test/private' }, { version: 'a'.repeat(36) }, { size: 4_000_001 }, { contentType: 'image/webp' }, { pathname: asset.pathname.replace('fixture-product', 'other-product') }]) {
    await f.db.query('UPDATE app_settings SET setting_value=$1::jsonb', [JSON.stringify({ ...asset, ...patch })]);
    assert.equal((await f.read('pdf')).status, 503);
  }
});

test('editor: explicit load, versioned upload, conflict disables retries, delete cancellation preserves asset', async t => {
  const savedWindow = global.window; global.window = { confirm: () => false }; t.after(() => { global.window = savedWindow; });
  const asset = { version: 'fixture-version', url: '/api/product-files/fixture-product/pdf?v=fixture-version' };
  const files = { image: null, pdf: asset, fallbackImageUrl: '/original.jpg' }, calls = [], changes = [];
  let response = { ok: true, ...files }, status = 200;
  const h = harness('src/components/ProductFilesEditor.tsx', {}, {
    '@/lib/staff-auth': { staffFetch: async (url, init) => { calls.push({ url, init }); return Response.json(response, { status }); } },
  });
  const render = () => h.render(h.component.ProductFilesEditor, { productId: 'fixture-product', lang: 'fr', onImageChange: url => changes.push(url) });
  assert.equal(calls.length, 0); assert.ok(findAll(render(), el => el.type === 'fieldset').every(el => el.props.disabled));
  await findAll(render(), el => el.type === 'button' && el.props.children === 'Actualiser')[0].props.onClick();
  assert.equal(calls.length, 1); assert.deepEqual(changes, ['/original.jpg']);
  await findAll(render(), el => el.type === 'button' && el.props.children === 'Supprimer')[0].props.onClick(); assert.equal(calls.length, 1);
  response = { ok: false, error: 'product_file_changed' }; status = 409;
  const input = findAll(render(), el => el.type === 'input' && el.props.accept === '.pdf')[0];
  // Invoke the event, then allow its promise to settle.
  input.props.onChange({ currentTarget: { files: [pdf()], value: 'details.pdf' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls[1].init.body.get('expectedVersion'), asset.version);
  assert.equal(h.state.files, null); assert.match(h.state.message, /changé/);
  assert.ok(findAll(render(), el => el.type === 'fieldset').every(el => el.props.disabled));
});

test('image integration: staff menu overrides uploaded images; deletion and public menu retain existing catalog paths', async t => {
  const f = await fixture(t);
  const original = '/assets/menu/existing-photo.png';
  const settings = {
    getResolvedMenuSections: async () => [{ id: 'food', items: [{ id: 'fixture-product', imagePath: original, visible: true }] }],
    getItemAvailabilityMap: async () => ({}), getPaymentConfig: async () => ({}), getTapToPayConfig: async () => ({}),
    getStoreConfig: async () => ({ events: [{ id: 'event-a' }], activeEventId: 'event-a' }),
  };
  const mocks = { ...f.mocks, '@/lib/menu-settings': settings };
  const adminMenu = load('src/app/api/admin/menu-config/route.ts', mocks);
  const publicMenu = load('src/app/api/menu-config/route.ts', mocks);
  const staffImage = async () => {
    const res = await adminMenu.GET(f.request('GET', undefined, 'cashier', '/api/admin/menu-config?eventId=event-a'));
    assert.equal(res.status, 200); return (await res.json()).sections[0].items[0].imagePath;
  };
  assert.equal(await staffImage(), original);
  const uploaded = await f.upload(await png(), '', 'image'); assert.equal(uploaded.status, 200);
  const asset = (await uploaded.json()).asset;
  assert.match(await staffImage(), /^\/api\/product-files\/fixture-product\/image\?v=.+&eventId=event-a$/);
  const publicRes = await publicMenu.GET(f.request('GET', undefined, '', '/api/menu-config?eventId=event-a'));
  assert.equal((await publicRes.json()).sections[0].items[0].imagePath, original);
  assert.equal((await f.remove(asset.version, 'image')).status, 200);
  assert.equal(await staffImage(), original);
});
