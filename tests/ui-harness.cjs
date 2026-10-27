/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');

function load(relative, mocks = {}, cache = new Map()) {
  const filename = path.resolve(relative);
  if (cache.has(filename)) return cache.get(filename);
  const loadedModule = { exports: {} };
  cache.set(filename, loadedModule.exports);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const localRequire = name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.css')) return {};
    if (!name.startsWith('@/') && !name.startsWith('.')) return require(name);
    const stem = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(filename), name);
    if (/\.tsx?$/.test(stem)) return load(stem, mocks, cache);
    return load(stem + (fs.existsSync(stem + '.ts') ? '.ts' : '.tsx'), mocks, cache);
  };
  new Function('require', 'module', 'exports', source)(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

function findAll(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(child => findAll(child, predicate));
  return [...(predicate(tree) ? [tree] : []), ...findAll(tree.props?.children, predicate)];
}

function harness(file, seed = {}, mocks = {}) {
  const names = [...fs.readFileSync(file, 'utf8').matchAll(/const \[([\w]+),[^\]]+\] = (?:React\.)?useState/g)].map(match => match[1]);
  const state = { ...seed }, refs = [], effects = [];let cursor = 0, refCursor = 0;
  const hooks = { ...React,
    useState: initial => { const name = names[cursor++] || 'requestedOrderId';if (!(name in state)) state[name] = typeof initial === 'function' ? initial() : initial;return [state[name], next => { state[name] = typeof next === 'function' ? next(state[name]) : next; }]; },
    useRef: initial => { const index = refCursor++;return refs[index] ||= { current: initial }; },
    useEffect: fn => { effects.push(fn); }, useCallback: fn => fn, useMemo: fn => fn(),
  };
  const component = load(file, { react: hooks, ...mocks });
  // Exercise the manual cashier inside its unchanged assignment wrapper.
  const Page = file === 'src/app/caisse/manual/page.tsx' ? component.default().props.children.type : component.default;
  const render = (fn = Page, props) => { cursor = 0;refCursor = 0;effects.length = 0;return fn(props); };
  return { component, render, state, effects };
}

module.exports = { load, findAll, harness };
