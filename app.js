(function () {
  'use strict';

  const {
    loadTodos,
    saveTodos,
    addTodo,
    toggleTodo,
    removeTodo,
    countRemaining,
    filterTodos,
  } = window.TodoStore;

  const form = document.getElementById('todo-form');
  const input = document.getElementById('todo-input');
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  const summary = document.getElementById('summary');
  const list = document.getElementById('todo-list');
  const emptyState = document.getElementById('empty-state');
  const status = document.getElementById('status');

  let todos = [];

  function setStatus(message) {
    status.textContent = message;
  }

  function load() {
    try {
      todos = loadTodos(window.localStorage);
    } catch (error) {
      todos = [];
      setStatus('无法读取本地存储：本次修改不会被保存。');
    }
  }

  function persist() {
    try {
      saveTodos(window.localStorage, todos);
      setStatus('');
    } catch (error) {
      setStatus('无法写入本地存储：刷新页面后修改可能丢失。');
    }
  }

  function createItem(todo) {
    const item = document.createElement('li');
    item.className = 'todo' + (todo.done ? ' todo--done' : '');
    item.dataset.id = todo.id;

    const label = document.createElement('label');
    label.className = 'todo__label';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'todo__checkbox';
    checkbox.checked = todo.done;
    checkbox.setAttribute('aria-label', (todo.done ? '取消完成：' : '完成：') + todo.text);

    const text = document.createElement('span');
    text.className = 'todo__text';
    text.textContent = todo.text;

    label.append(checkbox, text);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'todo__delete';
    removeButton.textContent = '删除';
    removeButton.setAttribute('aria-label', '删除：' + todo.text);

    item.append(label, removeButton);
    return item;
  }

  function render() {
    const rawQuery = searchInput.value;
    const query = rawQuery.trim();
    const visible = filterTodos(todos, query);
    const total = todos.length;

    list.replaceChildren();
    visible.forEach(function (todo) {
      list.append(createItem(todo));
    });

    if (total === 0) {
      summary.textContent = '暂无待办';
    } else if (query) {
      summary.textContent = '匹配 ' + visible.length + ' 项，共 ' + total + ' 项';
    } else {
      summary.textContent = '共 ' + total + ' 项，' + countRemaining(todos) + ' 项未完成';
    }

    const noMatches = total > 0 && query !== '' && visible.length === 0;
    if (total === 0) {
      emptyState.textContent = '还没有待办，先添加一条吧。';
    } else if (noMatches) {
      emptyState.textContent = '没有匹配「' + query + '」的待办。';
    }
    emptyState.hidden = !(total === 0 || noMatches);
    list.hidden = visible.length === 0;
    searchClear.hidden = rawQuery.length === 0;
  }

  function clearSearch() {
    searchInput.value = '';
    render();
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    const next = addTodo(todos, input.value);
    if (next === todos) {
      input.focus();
      return;
    }
    todos = next;
    persist();
    input.value = '';
    render();
    input.focus();
  });

  searchInput.addEventListener('input', render);

  searchInput.addEventListener('search', render);

  searchInput.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && searchInput.value !== '') {
      event.preventDefault();
      clearSearch();
    }
  });

  searchClear.addEventListener('click', function () {
    clearSearch();
    searchInput.focus();
  });

  list.addEventListener('change', function (event) {
    const checkbox = event.target.closest('.todo__checkbox');
    if (!checkbox) return;
    const item = checkbox.closest('.todo');
    if (!item) return;
    todos = toggleTodo(todos, item.dataset.id);
    persist();
    render();
  });

  list.addEventListener('click', function (event) {
    const button = event.target.closest('.todo__delete');
    if (!button) return;
    const item = button.closest('.todo');
    if (!item) return;
    todos = removeTodo(todos, item.dataset.id);
    persist();
    render();
    input.focus();
  });

  load();
  render();
})();
