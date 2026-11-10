'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const store = require('../store.js');

function createMemoryStorage(initial) {
  const data = new Map(Object.entries(initial || {}));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
}

test('createTodo trims text and rejects empty input', () => {
  const todo = store.createTodo('  买牛奶  ', { id: 'a1', now: 100 });
  assert.equal(todo.priority, 'medium');
  assert.equal(store.createTodo('   '), null);
  assert.equal(store.createTodo(''), null);
  assert.equal(store.createTodo(null), null);
});

test('createTodo caps text length at MAX_TEXT_LENGTH', () => {
  const todo = store.createTodo('x'.repeat(500), { id: 'a2', now: 0 });
  assert.equal(todo.text.length, store.MAX_TEXT_LENGTH);
});

test('priority defaults to medium and accepts the three supported levels', () => {
  assert.equal(store.createTodo('A').priority, 'medium');
  assert.equal(store.createTodo('A', { priority: 'high' }).priority, 'high');
  assert.equal(store.createTodo('A', { priority: 'low' }).priority, 'low');
  assert.equal(store.createTodo('A', { priority: 'urgent' }).priority, 'medium');
});

test('sortByPriority orders high to low and preserves equal-priority order', () => {
  const todos = [
    { id: 'm', priority: 'medium' },
    { id: 'l', priority: 'low' },
    { id: 'h1', priority: 'high' },
    { id: 'h2', priority: 'high' },
  ];
  assert.deepEqual(store.sortByPriority(todos).map((todo) => todo.id), ['h1', 'h2', 'm', 'l']);
  assert.equal(todos[0].id, 'm');
});

test('addTodo appends without mutating the original list', () => {
  const original = [];
  const next = store.addTodo(original, '第一条', { id: 't1', now: 1 });
  assert.equal(original.length, 0);
  assert.equal(next.length, 1);
  assert.equal(next[0].text, '第一条');
  assert.equal(store.addTodo(next, '   '), next);
});

test('toggleTodo flips only the matching item and keeps other fields', () => {
  const todos = [
    { id: 't1', text: 'A', done: false, createdAt: 1 },
    { id: 't2', text: 'B', done: false, createdAt: 2 },
  ];
  const next = store.toggleTodo(todos, 't2');
  assert.equal(next[0].done, false);
  assert.equal(next[1].done, true);
  assert.deepEqual(next[1], { id: 't2', text: 'B', done: true, createdAt: 2 });
  assert.equal(todos[1].done, false, 'original list must not be mutated');
  assert.equal(store.toggleTodo(next, 't2')[1].done, false);
});

test('removeTodo removes only the matching item', () => {
  const todos = [
    { id: 't1', text: 'A', done: false, createdAt: 1 },
    { id: 't2', text: 'B', done: true, createdAt: 2 },
  ];
  assert.deepEqual(store.removeTodo(todos, 't1'), [todos[1]]);
  assert.equal(store.removeTodo(todos, 'missing').length, 2);
  assert.equal(todos.length, 2, 'original list must not be mutated');
});

test('countRemaining counts unfinished items', () => {
  assert.equal(store.countRemaining([]), 0);
  assert.equal(
    store.countRemaining([
      { id: 't1', text: 'A', done: false, createdAt: 1 },
      { id: 't2', text: 'B', done: true, createdAt: 2 },
      { id: 't3', text: 'C', done: false, createdAt: 3 },
    ]),
    2
  );
});

const FILTER_TODOS = [
  { id: 't1', text: 'Buy milk', done: false, createdAt: 1 },
  { id: 't2', text: '写周报', done: true, createdAt: 2 },
  { id: 't3', text: '买牛奶', done: false, createdAt: 3 },
];

test('filterTodos returns every todo for a blank query', () => {
  assert.deepEqual(store.filterTodos(FILTER_TODOS, ''), FILTER_TODOS);
  assert.deepEqual(store.filterTodos(FILTER_TODOS, '   '), FILTER_TODOS);
  assert.deepEqual(store.filterTodos(FILTER_TODOS), FILTER_TODOS);
  assert.deepEqual(store.filterTodos([], 'milk'), []);
});

test('filterTodos matches a trimmed, case-insensitive substring', () => {
  assert.deepEqual(store.filterTodos(FILTER_TODOS, '  MILK ').map((t) => t.id), ['t1']);
  assert.deepEqual(store.filterTodos(FILTER_TODOS, '周报').map((t) => t.id), ['t2']);
  assert.deepEqual(store.filterTodos(FILTER_TODOS, '牛').map((t) => t.id), ['t3']);
  assert.deepEqual(store.filterTodos(FILTER_TODOS, 'i').map((t) => t.id), ['t1']);
});

test('filterTodos returns an empty list when nothing matches', () => {
  assert.deepEqual(store.filterTodos(FILTER_TODOS, '不存在的关键词'), []);
});

test('filterTodos does not mutate the input list', () => {
  const snapshot = JSON.parse(JSON.stringify(FILTER_TODOS));
  store.filterTodos(FILTER_TODOS, 'milk');
  assert.deepEqual(FILTER_TODOS, snapshot);
});

test('filtered todos can be sorted by priority without changing the source list', () => {
  const todos = [
    { id: 'low-match', text: 'task low', priority: 'low' },
    { id: 'unrelated', text: 'other high', priority: 'high' },
    { id: 'high-match', text: 'task high', priority: 'high' },
    { id: 'medium-match', text: 'task medium', priority: 'medium' },
  ];

  const visible = store.sortByPriority(store.filterTodos(todos, 'task'));

  assert.deepEqual(visible.map((todo) => todo.id), ['high-match', 'medium-match', 'low-match']);
  assert.deepEqual(todos.map((todo) => todo.id), ['low-match', 'unrelated', 'high-match', 'medium-match']);
});

test('saveTodos then loadTodos round-trips the list', () => {
  const storage = createMemoryStorage();
  const todos = [
    { id: 't1', text: 'write README', done: false, createdAt: 10, priority: 'medium' },
    { id: 't2', text: 'run tests', done: true, createdAt: 20, priority: 'high' },
  ];
  store.saveTodos(storage, todos);
  assert.deepEqual(store.loadTodos(storage), todos);
});

test('loadTodos returns an empty list when storage is empty', () => {
  assert.deepEqual(store.loadTodos(createMemoryStorage()), []);
});

test('loadTodos tolerates corrupted JSON', () => {
  const storage = createMemoryStorage({ [store.STORAGE_KEY]: '{not json' });
  assert.deepEqual(store.loadTodos(storage), []);
});

test('loadTodos drops malformed entries but keeps valid ones', () => {
  const storage = createMemoryStorage({
    [store.STORAGE_KEY]: JSON.stringify([
    { id: 'ok', text: 'valid', done: true, createdAt: 5, priority: 'medium' },
      { id: '', text: '缺少 id', done: false, createdAt: 6 },
      { id: 'no-text', text: '   ', done: false, createdAt: 7 },
      null,
      'not-an-object',
    ]),
  });
  assert.deepEqual(store.loadTodos(storage), [
    { id: 'ok', text: 'valid', done: true, createdAt: 5, priority: 'medium' },
  ]);
});

test('loadTodos propagates storage access errors to the caller', () => {
  const brokenStorage = {
    getItem() {
      throw new Error('storage disabled');
    },
  };
  assert.throws(() => store.loadTodos(brokenStorage), /storage disabled/);
});

test('saveTodos propagates write errors to the caller', () => {
  const brokenStorage = {
    setItem() {
      throw new Error('quota exceeded');
    },
  };
  assert.throws(() => store.saveTodos(brokenStorage, []), /quota exceeded/);
});
