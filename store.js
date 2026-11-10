/*
 * Todo store: pure state helpers plus localStorage persistence.
 * Runs as a classic browser script (exposes window.TodoStore) and as a
 * CommonJS module for the Node test runner.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.TodoStore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 't3-todo-app.v1';
  const MAX_TEXT_LENGTH = 200;
  const PRIORITIES = ['high', 'medium', 'low'];

  function makeId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'todo-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function createTodo(text, options) {
    const opts = options || {};
    const normalized = String(text == null ? '' : text).trim().slice(0, MAX_TEXT_LENGTH);
    if (!normalized) return null;
    return {
      id: opts.id || makeId(),
      text: normalized,
      done: false,
      createdAt: typeof opts.now === 'number' ? opts.now : Date.now(),
      priority: PRIORITIES.includes(opts.priority) ? opts.priority : 'medium',
    };
  }

  function addTodo(todos, text, options) {
    const todo = createTodo(text, options);
    if (!todo) return todos;
    return todos.concat(todo);
  }

  function toggleTodo(todos, id) {
    return todos.map(function (todo) {
      return todo.id === id ? Object.assign({}, todo, { done: !todo.done }) : todo;
    });
  }

  function removeTodo(todos, id) {
    return todos.filter(function (todo) {
      return todo.id !== id;
    });
  }

  function countRemaining(todos) {
    return todos.filter(function (todo) {
      return !todo.done;
    }).length;
  }

  function sortByPriority(todos) {
    const rank = { high: 0, medium: 1, low: 2 };
    return todos.map(function (todo, index) { return { todo: todo, index: index }; })
      .sort(function (a, b) {
        return (rank[a.todo.priority] === undefined ? 1 : rank[a.todo.priority]) -
          (rank[b.todo.priority] === undefined ? 1 : rank[b.todo.priority]) || a.index - b.index;
      }).map(function (entry) { return entry.todo; });
  }

  /**
   * Returns the todos whose text contains the query as a case-insensitive
   * substring. A blank query matches everything. The input list is untouched.
   */
  function filterTodos(todos, query) {
    const needle = String(query == null ? '' : query).trim().toLowerCase();
    if (!needle) return todos.slice();
    return todos.filter(function (todo) {
      return String(todo.text).toLowerCase().indexOf(needle) !== -1;
    });
  }

  function sanitizeTodo(value) {
    if (!value || typeof value !== 'object') return null;
    const id = typeof value.id === 'string' && value.id ? value.id : '';
    const text = typeof value.text === 'string' ? value.text.trim().slice(0, MAX_TEXT_LENGTH) : '';
    if (!id || !text) return null;
    return {
      id: id,
      text: text,
      done: value.done === true,
      createdAt: typeof value.createdAt === 'number' && isFinite(value.createdAt) ? value.createdAt : 0,
      priority: PRIORITIES.includes(value.priority) ? value.priority : 'medium',
    };
  }

  function sanitizeTodos(value) {
    if (!Array.isArray(value)) return [];
    return value.map(sanitizeTodo).filter(Boolean);
  }

  /**
   * Reads todos from a Storage-like object. Storage access errors propagate
   * (the caller decides how to warn); corrupted JSON is treated as empty.
   */
  function loadTodos(storage) {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      return sanitizeTodos(JSON.parse(raw));
    } catch (error) {
      return [];
    }
  }

  function saveTodos(storage, todos) {
    storage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    MAX_TEXT_LENGTH: MAX_TEXT_LENGTH,
    createTodo: createTodo,
    addTodo: addTodo,
    toggleTodo: toggleTodo,
    removeTodo: removeTodo,
    countRemaining: countRemaining,
    sortByPriority: sortByPriority,
    filterTodos: filterTodos,
    sanitizeTodos: sanitizeTodos,
    loadTodos: loadTodos,
    saveTodos: saveTodos,
  };
});
