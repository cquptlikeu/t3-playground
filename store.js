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
    };
  }

  function addTodo(todos, text, options) {
    const todo = createTodo(text, options);
    if (!todo) return todos;
    return todos.concat(todo);
  }

  function toggleTodo(todos, id) {
    return todos.map(function (todo) {
      return todo.id === id ? { id: todo.id, text: todo.text, done: !todo.done, createdAt: todo.createdAt } : todo;
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
    sanitizeTodos: sanitizeTodos,
    loadTodos: loadTodos,
    saveTodos: saveTodos,
  };
});
