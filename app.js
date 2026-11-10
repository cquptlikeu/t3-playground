(function () {
  'use strict';

  const {
    loadTodos,
    saveTodos,
    addTodo,
    toggleTodo,
    removeTodo,
    countRemaining,
    sortByPriority,
  } = window.TodoStore;

  const form = document.getElementById('todo-form');
  const input = document.getElementById('todo-input');
  const summary = document.getElementById('summary');
  const list = document.getElementById('todo-list');
  const emptyState = document.getElementById('empty-state');
  const status = document.getElementById('status');
  const priorityInput = document.getElementById('priority-input');
  const prioritySort = document.getElementById('priority-sort');

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

    const priority = document.createElement('span');
    priority.className = 'todo__priority todo__priority--' + todo.priority;
    priority.textContent = { high: '高', medium: '中', low: '低' }[todo.priority] || '中';
    priority.setAttribute('aria-label', '优先级：' + priority.textContent);

    const prioritySelect = document.createElement('select');
    prioritySelect.className = 'todo__priority-select';
    prioritySelect.setAttribute('aria-label', '设置优先级：' + todo.text);
    [['high', '高'], ['medium', '中'], ['low', '低']].forEach(function (entry) {
      const option = document.createElement('option');
      option.value = entry[0];
      option.textContent = entry[1];
      option.selected = todo.priority === entry[0];
      prioritySelect.append(option);
    });

    label.append(checkbox, text);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'todo__delete';
    removeButton.textContent = '删除';
    removeButton.setAttribute('aria-label', '删除：' + todo.text);

    item.append(label, priority, prioritySelect, removeButton);
    return item;
  }

  function render() {
    list.replaceChildren();
    const visibleTodos = prioritySort.value === 'priority' ? sortByPriority(todos) : todos;
    visibleTodos.forEach(function (todo) {
      list.append(createItem(todo));
    });

    const remaining = countRemaining(todos);
    summary.textContent = todos.length === 0
      ? '暂无待办'
      : '共 ' + todos.length + ' 项，' + remaining + ' 项未完成';
    emptyState.hidden = todos.length > 0;
    list.hidden = todos.length === 0;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    const next = addTodo(todos, input.value, { priority: priorityInput.value });
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

  list.addEventListener('change', function (event) {
    const prioritySelect = event.target.closest('.todo__priority-select');
    if (prioritySelect) {
      const item = prioritySelect.closest('.todo');
      todos = todos.map(function (todo) {
        return todo.id === item.dataset.id ? Object.assign({}, todo, { priority: prioritySelect.value }) : todo;
      });
      persist();
      render();
      return;
    }
    const checkbox = event.target.closest('.todo__checkbox');
    if (!checkbox) return;
    const item = checkbox.closest('.todo');
    if (!item) return;
    todos = toggleTodo(todos, item.dataset.id);
    persist();
    render();
  });

  prioritySort.addEventListener('change', render);

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
